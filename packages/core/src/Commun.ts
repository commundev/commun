import express, { Express, Request } from 'express'
import compression from 'compression'
import bodyParser from 'body-parser'
import lusca from 'lusca'
import morgan from 'morgan'
import {
  Entity,
  EntityConfig,
  EntityModel,
  Module,
  Plugin,
  RegisterEntityOptions,
  RegisterPluginOptions
} from './types'
import errorHandler from 'errorhandler'
import { MongoClient, MongoClientCommonOption } from 'mongodb'
import chalk from 'chalk'
import { singular } from 'pluralize'
import { MongoDbConnection } from './dao/MongoDbConnection'
import { EntityController, PluginController } from './controllers'
import { EntityDao } from './dao/EntityDao'
import { NotFoundError } from './errors'
import { ConfigManager } from './ConfigManager'
import { generateJsonSchemaTypings } from './utils'

let entities: { [key: string]: Entity<EntityModel> } = {}
let plugins: { [key: string]: Plugin } = {}
let communOptions: CommunOptions
const entitySingularToPlural: Map<string, string> = new Map

let app: Express

export type CommunOptions = {
  port?: number
  endpoint?: string
  appName?: string
  mongoDB: {
    uri: string
    dbName: string
    options?: MongoClientCommonOption
  }
  logger?: {
    request?: string
  }
  maxRequestSize?: string
}

export const Commun = {
  createExpressApp (): Express {
    app = express()

    // Express configuration
    app.set('port', communOptions.port || process.env.PORT || 3000)
    app.use(compression())
    app.use(bodyParser.json({ limit: communOptions.maxRequestSize }))
    app.use(bodyParser.urlencoded({ limit: communOptions.maxRequestSize, extended: true }))
    app.use(lusca.xframe('SAMEORIGIN'))
    app.use(lusca.xssProtection(true))

    if (communOptions.logger?.request) {
      app.use(morgan(communOptions.logger?.request))
    }

    return app
  },

  getExpressApp () {
    return app
  },

  configureRoutes () {
    for (const module of [...Object.values(plugins), ...Object.values(entities)]) {
      if (module.router) {
        app.use('/api/v1', module.router)
      }
    }
    app.use('/api/v1', require('./routes/ApiRoutes').default)
  },

  async connectDb () {
    console.log(chalk.cyan('Connecting to MongoDB...'))
    const client = new MongoClient(communOptions.mongoDB.uri, {
      useUnifiedTopology: true
    })
    await client.connect()
    MongoDbConnection.setClient(client)
    MongoDbConnection.setDb(client.db(communOptions.mongoDB.dbName, communOptions.mongoDB.options || {}))
    console.log(chalk.cyanBright('Successfully connected to MongoDB'))
    return MongoDbConnection
  },

  async createDbIndexes () {
    for (const entity of Object.values(entities)) {
      await entity.dao.createIndexes(entity.config)
    }
  },

  async closeDb () {
    await MongoDbConnection.getClient().close()
  },

  async startServer (dirname: string, options?: CommunOptions, expressApp?: Express) {
    console.log(chalk.cyan(`Starting ${process.env.NODE_ENV} server...`))

    ConfigManager.setRootPath(dirname)
    this.setOptions(options || await ConfigManager.readEnvConfig())
    await this._setupPlugins()
    await this._registerEntitiesFromConfigFiles()
    await generateJsonSchemaTypings(entities)

    await this.connectDb()
    await this.createDbIndexes()

    app = expressApp || app || this.createExpressApp()

    await this._runOnModules(module => module.onExpressAppCreated?.(app))
    this.configureRoutes()

    if (process.env.NODE_ENV !== 'production') {
      app.use(errorHandler())
    }

    await this._runOnModules(module => module.beforeServerStart?.())

    app.listen(app.get('port'), async () => {
      console.log()
      console.log(chalk.green(`🚀 ${app.get('env')} server started at http://localhost:${app.get('port')}`))
      console.log()
      console.log(`    🎩‍Admin dashboard: ${communOptions.endpoint}/dashboard`)
      console.log()
      console.log(`    💪 API endpoint: ${communOptions.endpoint}/api/v1/:entity`)
      console.log()

      await this._runOnModules(module => module.afterServerStart?.())
    })

    return app
  },

  async _registerEntitiesFromConfigFiles () {
    const entityConfigs = await ConfigManager.getEntityConfigs()
    for (const config of entityConfigs) {
      if (!entities[config.entityName]) {
        const codeHooks = await ConfigManager.getEntityCodeHooks(config.entityName)
        this.registerEntity({ config, codeHooks })
      }
    }
  },

  async _setupPlugins () {
    const plugins = await ConfigManager.getPluginNames()
    for (const pluginName of plugins) {
      await ConfigManager.runPluginSetup(pluginName)
    }
  },

  async _runOnModules (cb: (module: Module) => any) {
    const modules = [...Object.entries(plugins), ...Object.entries(entities)]
      // Always run users plugin first (in order to ensure auth is available for all other plugins)
      .sort(([key]) => key === 'users' ? -1 : 1)
      .map(([_, value]) => value)

    for (const module of modules) {
      await cb(module)
    }
  },

  getPluralEntityName (entitySingularName: string) {
    return entitySingularToPlural.get(entitySingularName)
  },

  registerEntity<MODEL extends EntityModel> (entity: RegisterEntityOptions<MODEL>): Entity<MODEL> {
    if (!entity.config.entityName) {
      throw new Error('Config must include "entityName"')
    }
    if (!entity.config.collectionName) {
      throw new Error('Config must include "collectionName"')
    }

    // set default entitySingularName
    if (!entity.config.entitySingularName) {
      const entitySingularName = singular(entity.config.entityName)
      if (entity.config.entityName === entitySingularName) {
        entity.config.entitySingularName = entity.config.entityName + 'Item'
      } else {
        entity.config.entitySingularName = entitySingularName
      }
    }

    entitySingularToPlural.set(entity.config.entitySingularName, entity.config.entityName)

    entity.config.permissions = entity.config.permissions || {}
    entity.config.permissions.properties = entity.config.permissions.properties || {}
    entity.config.schema = entity.config.schema || {}
    entity.config.schema.properties = entity.config.schema.properties || {}
    entity.config.schema.$id = '#entity/' + entity.config.entitySingularName
    entity.config.schema.title = entity.config.schema.title || entity.config.entitySingularName

    // set default id property
    if (!entity.config.schema.properties.id) {
      entity.config.schema.properties.id = {
        type: 'string',
        format: 'id',
      }
      if (entity.config.permissions.get) {
        entity.config.permissions.properties.id = {
          ...(entity.config.permissions.properties.id || {}),
          get: entity.config.permissions.get,
        }
      }
    }

    // set createdAt and updatedAt properties
    for (const dateField of ['createdAt', 'updatedAt']) {
      if (!entity.config.schema.properties[dateField]) {
        entity.config.schema.properties[dateField] = {
          type: 'object',
          format: 'date-time',
        }
        entity.config.permissions.properties[dateField] = {
          ...(entity.config.permissions.properties[dateField] || {}),
          get: entity.config.permissions?.get || 'system',
          create: 'system',
          update: 'system',
        }
      }
    }

    // set default apiKey
    if (!entity.config.apiKey) {
      entity.config.apiKey = 'id'
    }

    const registeredEntity: Entity<MODEL> = {
      ...entity,
      dao: entity.dao || new EntityDao<MODEL>(entity.config.collectionName),
      controller: entity.controller || new EntityController<MODEL>(entity.config.entityName),
    }
    entities[entity.config.entityName] = registeredEntity
    return registeredEntity
  },

  getEntity<MODEL extends EntityModel> (entityName: string): Entity<MODEL> {
    const entity = entities[entityName] as Entity<MODEL>
    if (!entity) {
      throw new NotFoundError(`Entity ${entityName} not registered`)
    }
    return entity
  },

  getEntityConfig<MODEL extends EntityModel> (entityName: string): EntityConfig<MODEL> {
    return this.getEntity<MODEL>(entityName).config
  },

  getEntityDao<MODEL extends EntityModel> (entityName: string): EntityDao<MODEL> {
    return this.getEntity<MODEL>(entityName).dao
  },

  getEntityController<MODEL extends EntityModel> (entityName: string): EntityController<MODEL> {
    return this.getEntity<MODEL>(entityName).controller
  },

  getEntityRouter<MODEL extends EntityModel> (entityName: string): express.Router | undefined {
    return this.getEntity<MODEL>(entityName).router
  },

  getEntities () {
    return entities
  },

  registerPlugin (pluginName: string, plugin: RegisterPluginOptions) {
    plugins[pluginName] = {
      controller: plugin.controller || new PluginController(),
      config: plugin.config || {},
      ...plugin
    }
    return plugins[pluginName]
  },

  getPlugin (pluginName: string) {
    const plugin = plugins[pluginName]
    if (!plugin) {
      throw new NotFoundError(`Plugin ${pluginName} not registered`)
    }
    return plugin
  },

  getOptions () {
    return communOptions
  },

  setOptions (options: CommunOptions) {
    communOptions = options
  },

  registerLogsToken (token: string, cb: (req: Request) => any) {
    morgan.token(token, cb)
  },

  deregisterAll () {
    entities = {}
    plugins = {}
  }
}
