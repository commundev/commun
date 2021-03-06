import path from 'path'
import fs from 'fs'
import { promisify } from 'util'
import { EntityConfig, EntityModel } from './types'
import { CommunOptions } from './Commun'
import { EntityCodeHooks } from './types/EntityCodeHooks'

let projectRootPath: string
let srcRootPath: string
let distRootPath: string

export const ConfigManager = {
  getEntityPath (entityName: string) {
    return path.join(srcRootPath, `entities/${entityName}`)
  },

  getEntityConfigFilePath (entityName: string) {
    return path.join(srcRootPath, `entities/${entityName}/config.json`)
  },

  async readEnvConfig () {
    const configFile = (await this._readFile(path.join(srcRootPath, `config/${process.env.NODE_ENV}.json`))).toString()
    if (!configFile) {
      throw new Error(`Config file for environment ${process.env.NODE_ENV} not found`)
    }
    return JSON.parse(configFile)
  },

  async getEntityConfigs<T> () {
    const entityDirs = await this._readdir(path.join(srcRootPath, 'entities'))
    const entities = []
    for (const entity of entityDirs) {
      entities.push(await this.readEntityConfig<T>(entity))
    }
    return entities
  },

  async readEntityConfig<T> (entityName: string): Promise<EntityConfig<T>> {
    const entityConfig = (await this._readFile(this.getEntityConfigFilePath(entityName))).toString()
    if (!entityConfig) {
      throw new Error(`Config file for entity ${entityName} not found`)
    }
    return JSON.parse(entityConfig)
  },

  async setEntityConfig<T extends EntityModel> (entityName: string, config: EntityConfig<T>) {
    await (this._writeFile(this.getEntityConfigFilePath(entityName), JSON.stringify(config, null, 2)))
  },

  async mergeEntityConfig<T extends EntityModel> (entityName: string, config: { [key in keyof EntityConfig<T>]?: any }) {
    const entityConfig = await this.readEntityConfig<T>(entityName)
    for (const key of Object.keys(config)) {
      entityConfig[key as keyof EntityConfig<T>] = config[key as keyof EntityConfig<T>]
    }
    await this.setEntityConfig<T>(entityName, entityConfig)
    return entityConfig
  },

  async createEntityConfig<T extends EntityModel> (entityName: string, config: EntityConfig<T>) {
    const entityPath = this.getEntityPath(entityName)
    if (!(await this._exists(entityPath))) {
      await this._mkdir(entityPath)
    }
    await this.setEntityConfig(entityName, config)
  },

  async deleteEntity (entityName: string) {
    const entityPath = this.getEntityPath(entityName)
    if (await this._exists(entityPath)) {
      const files = await this._readdir(entityPath)
      for (const file of files) {
        await this._unlink(path.join(entityPath, file))
      }
      await this._rmdir(entityPath)
    }
  },

  async getEntityCodeHooks (entityName: string): Promise<EntityCodeHooks> {
    const file = path.join(distRootPath, `entities/${entityName}/hooks.js`)
    if (await this._exists(file)) {
      return require(file).default
    }
    return {}
  },

  getPluginPath (pluginName: string) {
    return path.join(srcRootPath, `plugins/${pluginName}`)
  },

  getPluginSetupModulePath (pluginName: string) {
    return path.join(distRootPath, `plugins/${pluginName}/setup.js`)
  },

  getPluginConfigFilePath (pluginName: string) {
    return path.join(this.getPluginPath(pluginName), 'config.json')
  },

  getPluginNames () {
    return this._readdir(path.join(srcRootPath, 'plugins'))
  },

  async runPluginSetup (pluginName: string): Promise<void> {
    const pluginSetup = this.getPluginSetupModulePath(pluginName)
    if (!pluginSetup) {
      throw new Error(`Config file for plugin ${pluginName} not found`)
    }
    return await require(pluginSetup).default()
  },

  async readPluginConfig<T> (pluginName: string): Promise<T> {
    const pluginConfig = (await this._readFile(this.getPluginConfigFilePath(pluginName))).toString()
    if (!pluginConfig) {
      throw new Error(`Config file for plugin ${pluginName} not found`)
    }
    return JSON.parse(pluginConfig)
  },

  async setPluginFile<T> (pluginName: string, filePath: string, content: T) {
    await this._writeFile(path.join(this.getPluginPath(pluginName), filePath), JSON.stringify(content, null, 2))
  },

  async deletePluginFile (pluginName: string, filePath: string) {
    await this._unlink(path.join(this.getPluginPath(pluginName), filePath))
  },

  setPluginConfig<T> (pluginName: string, config: T) {
    return this.setPluginFile<T>(pluginName, 'config.json', config)
  },

  async mergePluginConfig<T> (pluginName: string, config: Partial<T>) {
    const pluginConfig = await this.readPluginConfig<T>(pluginName)
    for (const key of Object.keys(config)) {
      pluginConfig[key as keyof T] = config[key as keyof T]!
    }
    await this.setPluginConfig<T>(pluginName, pluginConfig)
    return pluginConfig
  },

  async writeGeneratedFile (filename: string, content: string, onlyOnChanges: boolean = false) {
    const generatedPath = path.join(this.projectRootPath, '/generated')
    const filePath = path.join(generatedPath, filename)
    if (!(await this._exists(generatedPath))) {
      await this._mkdir(generatedPath)
    }
    if (onlyOnChanges) {
      const originalContent = (await this._readFile(filePath)).toString()
      if (originalContent === content) {
        return
      }
    }
    await this._writeFile(path.join(generatedPath, filename), content)
  },

  async getCommunOptions (): Promise<{ [key: string]: CommunOptions }> {
    const configPath = path.join(srcRootPath, 'config')
    const envFiles = await this._readdir(configPath)
    const options: { [key: string]: CommunOptions } = {}
    for (const file of envFiles) {
      const envName = file.replace(/\.json$/, '')
      options[envName] = JSON.parse((await this._readFile(path.join(configPath, file))).toString())
    }
    return options
  },

  async setCommunOptions (environment: string, options: CommunOptions) {
    const configPath = path.join(srcRootPath, `config/${environment}.json`)
    await this._writeFile(configPath, JSON.stringify(options, null, 2))
  },

  async getKeys (name: string) {
    const keysPath = path.join(srcRootPath, '../keys')
    const publicKey = (await this._readFile(path.join(keysPath, `${name}.pub`))).toString()
    const privateKey = (await this._readFile(path.join(keysPath, `${name}.pem`))).toString()
    return {
      publicKey,
      privateKey
    }
  },

  /**
   * Saves variables on the project's .env file
   */
  async setEnvironmentVariable (variables: { [key: string]: string }) {
    const dotEnvPath = path.join(projectRootPath, '.env')
    const dotEnvLines: string[] = []
    if (await this._exists(dotEnvPath)) {
      const dotEnvFile = (await this._readFile(dotEnvPath)).toString()
      dotEnvLines.push(...dotEnvFile.split('\n'))
    }
    for (const [variableName, variableValue] of Object.entries(variables)) {
      const newVariableLine = `${variableName}=${variableValue}`
      const variableLineIndex = dotEnvLines.findIndex(line => line.trim().startsWith(`${variableName}=`))
      if (variableLineIndex >= 0) {
        dotEnvLines[variableLineIndex] = newVariableLine
      } else {
        dotEnvLines.push(newVariableLine)
      }
    }
    await this._writeFile(dotEnvPath, dotEnvLines.join('\n'))
  },

  setRootPath (pathname: string) {
    distRootPath = pathname
    srcRootPath = pathname.replace(/\/dist$/, '/src')
    projectRootPath = path.join(pathname, '../')
  },

  get projectRootPath () {
    return projectRootPath
  },

  _readFile: fs.promises.readFile,
  _writeFile: fs.promises.writeFile,
  _unlink: fs.promises.unlink,
  _exists: promisify(fs.exists),
  _readdir: fs.promises.readdir,
  _mkdir: fs.promises.mkdir,
  _rmdir: fs.promises.rmdir,
}
