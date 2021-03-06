import { Request } from 'express'
import {
  BadRequestError,
  Commun,
  DaoFilter,
  EntityModel,
  EntityPermission,
  getEntityRef,
  getJoinProperty,
  getModelPropertyValue,
  getSchemaDefinitions,
  getSchemaValidator,
  isEntityRef,
  isSystemProperty,
  UnauthorizedError
} from '..'
import { EntityActionPermissions } from '../types'
import { ClientError, NotFoundError } from '../errors'
import { entityHooks } from '../entity/entityHooks'
import {
  ApiEntityFilter,
  decodePaginationCursor,
  encodePaginationCursor,
  parseFilter,
  strToApiFilter
} from '../utils/ApiUtils'
import { ValidateFunction } from 'ajv'

type RequestOptions = {
  findModelById?: boolean
}

type PageInfo = {
  startCursor?: string
  endCursor?: string
  hasPreviousPage?: boolean
  hasNextPage?: boolean
}

type AuthPermissions = {
  userId: string | null
  isAdmin: boolean
}

interface EntityListRequestedKeys {
  nodes?: object
  pageInfo?: PageInfo
  totalCount?: number
}

interface EntityListResult<T extends EntityModel> {
  items: T[]
  pageInfo: PageInfo
  totalCount?: number
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export class EntityController<T extends EntityModel> {
  protected createEntityValidator?: ValidateFunction
  protected updateEntityValidator?: ValidateFunction

  constructor (protected readonly entityName: string) {}

  protected get config () {
    return Commun.getEntityConfig<T>(this.entityName)
  }

  protected get dao () {
    return Commun.getEntityDao<T>(this.entityName)
  }

  async list (req: Request, requestedKeys?: 'all' | EntityListRequestedKeys): Promise<EntityListResult<T>> {
    const auth = await this.getAuthPermissions(req)
    if (this.config.permissions?.get !== 'own') {
      this.validateActionPermissions(auth, null, 'get')
    }

    const pageInfo: PageInfo = {}

    const sort: { [P in keyof T]?: 1 | -1 } = {}
    const orderBy = req.query.orderby || req.query.orderBy
    if (orderBy && typeof orderBy === 'string') {
      const [sortKey, sortDir] = orderBy.split(':')
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'createdAt') {
        sort.id = dir
      } else {
        sort[sortKey as keyof T] = dir
      }
    }

    let filter: DaoFilter<T> = {}
    if (req.query.filter) {
      let entityFilter
      if (typeof req.query.filter === 'string') {
        entityFilter = strToApiFilter(req.query.filter, this.config.schema)
      }
      filter = parseFilter(entityFilter || req.query.filter as ApiEntityFilter, this.config.schema) as DaoFilter<T>
    }

    if (req.query.search && typeof req.query.search === 'string') {
      filter.$text = {
        $search: req.query.search
      }
    }

    let limit = Number(req.query.first) || DEFAULT_PAGE_SIZE
    if (limit > MAX_PAGE_SIZE) {
      limit = MAX_PAGE_SIZE
    }

    // if hasNextPage was requested, increase the limit in 1, but don't return that item
    const requestedHasNextPage = requestedKeys === 'all' || requestedKeys?.pageInfo?.hasNextPage
    if (requestedHasNextPage) {
      limit++
    }

    let skip
    if (Number.isInteger(Number(req.query.last)) && Number(req.query.last) > 0) {
      skip = Number(req.query.last)
    }
    let before
    if (req.query.before && typeof req.query.before === 'string') {
      before = decodePaginationCursor<T>(req.query.before.trim())
    }
    let after
    if (req.query.after && typeof req.query.after === 'string') {
      after = decodePaginationCursor<T>(req.query.after.trim())
    }

    const populate = this.getPopulateFromRequest(req)

    const queryResult = await this.dao.findAndReturnCursor(filter, { sort, limit, skip, before, after })
    const models = queryResult.items

    if (requestedHasNextPage && models.length === limit) {
      models.pop()
      pageInfo.hasNextPage = true
    }

    const modelPermissions = models.map(model => this.hasValidPermissions(auth, model, 'get', this.config.permissions))
    const modelsWithValidPermissions = models.filter((_, i) => modelPermissions[i])

    const items = await Promise.all(modelsWithValidPermissions.map(model => this.prepareModelResponse(req, auth, model, populate)))

    if (items.length) {
      pageInfo.startCursor = encodePaginationCursor(items[0], sort)
      pageInfo.endCursor = encodePaginationCursor(items[items.length - 1], sort)
    }
    if (requestedKeys === 'all' || requestedKeys?.pageInfo) {
      pageInfo.hasPreviousPage = !!skip || !!after
      pageInfo.hasNextPage = pageInfo.hasNextPage || false
    }

    const entityListResult: EntityListResult<T> = {
      items,
      pageInfo,
    }

    if (typeof requestedKeys === 'object' && requestedKeys.totalCount) {
      entityListResult.totalCount = await queryResult.cursor.count()
    }

    return entityListResult
  }

  async get (req: Request, options: RequestOptions = {}): Promise<{ item: T }> {
    const model = await this.findModelByApiKey(req, options)
    if (!model) {
      throw new NotFoundError()
    }
    const auth = await this.getAuthPermissions(req)
    this.validateActionPermissions(auth, model, 'get')
    await entityHooks.run(this.entityName, 'beforeGet', model, req)
    const item = await this.prepareModelResponse(req, auth, model, this.getPopulateFromRequest(req))
    await entityHooks.run(this.entityName, 'afterGet', model, req)
    return {
      item
    }
  }

  async create (req: Request): Promise<{ item: T }> {
    const auth = await this.getAuthPermissions(req)
    this.validateActionPermissions(auth, null, 'create')
    const model = await this.getModelFromBodyRequest(req, auth, 'create')
    await entityHooks.run(this.entityName, 'beforeCreate', model, req)
    try {
      const insertedModel = await this.dao.insertOne(model)
      await entityHooks.run(this.entityName, 'afterCreate', insertedModel, req)
      return {
        item: await this.prepareModelResponse(req, auth, insertedModel, this.getPopulateFromRequest(req))
      }
    } catch (e) {
      if (e.code === 11000) {
        throw new ClientError('Duplicated key', 400)
      }
      throw e
    }
  }

  async update (req: Request, options: RequestOptions = {}): Promise<{ item: T }> {
    const model = await this.findModelByApiKey(req, options)
    if (!model) {
      throw new NotFoundError()
    }
    const auth = await this.getAuthPermissions(req)
    this.validateActionPermissions(auth, model, 'update')
    await entityHooks.run(this.entityName, 'beforeUpdate', model, req)
    const modelData = await this.getModelFromBodyRequest(req, auth, 'update', model)
    try {
      const updatedItem = await this.dao.updateOne(model.id!, modelData)
      await entityHooks.run(this.entityName, 'afterUpdate', updatedItem, req)
      return {
        item: await this.prepareModelResponse(req, auth, updatedItem, this.getPopulateFromRequest(req))
      }
    } catch (e) {
      if (e.code === 11000) {
        throw new ClientError('Duplicated key', 400)
      }
      throw e
    }
  }

  async delete (req: Request, options: RequestOptions = {}): Promise<{ result: boolean }> {
    const model = await this.findModelByApiKey(req, options)
    if (!model) {
      return { result: true }
    }
    const auth = await this.getAuthPermissions(req)
    this.validateActionPermissions(auth, model, 'delete')
    await entityHooks.run(this.entityName, 'beforeDelete', model, req)
    const result = await this.dao.deleteOne(model.id!)
    await entityHooks.run(this.entityName, 'afterDelete', model, req)
    return { result }
  }

  protected findModelByApiKey (req: Request, options: RequestOptions) {
    if (options.findModelById || !this.config.apiKey || this.config.apiKey === 'id') {
      return this.dao.findOneById(req.params.id)
    }
    const attrKey = this.config.apiKey
    const property = this.config.schema?.properties?.[attrKey]
    let value: string | number | boolean
    if (typeof property === 'boolean' || property?.type === 'boolean') {
      value = Boolean(req.params.id)
    } else if (property?.type === 'number') {
      value = Number(req.params.id)
    } else {
      value = req.params.id
    }
    return this.dao.findOne({ [attrKey]: value } as DaoFilter<T>)
  }

  protected async getModelFromBodyRequest (req: Request, auth: AuthPermissions, action: 'create' | 'update', persistedModel?: T): Promise<T> {
    const model: T = {} as T
    const definitions = getSchemaDefinitions()
    this.config.schema.definitions = {
      ...definitions,
      ...(this.config.schema.definitions || {}),
    }

    let validationResult
    let validator: ValidateFunction
    if (action === 'create') {
      validator = this.getCreateEntityValidator()
      validationResult = validator(req.body)
    } else {
      validator = this.getUpdateEntityValidator()
      validationResult = validator(req.body)
    }

    if (!validationResult) {
      const errorMessage = (validator.errors || [])
        .map(error => {
          let errorName = error.dataPath || this.entityName
          if (errorName.startsWith('.')) {
            errorName = errorName.substr(1)
          }
          return errorName + ' ' + error.message
        }).join(', ')
      throw new BadRequestError(errorMessage ? errorMessage : 'Invalid request data')
    }

    for (const [key, property] of Object.entries(this.config.schema.properties || {})) {
      const permissions = {
        ...this.config.permissions,
        ...this.config.permissions?.properties?.[key],
      }
      if (typeof property === 'boolean') {
        continue
      }

      const validPermissions = this.hasValidPermissions(auth, persistedModel || null, action, permissions)
      const shouldSetValue = action === 'create' || (!property.readOnly && req.body[key] !== undefined)
      const settingUser = property.$ref === '#user' && action === 'create'
      const settingEvalProperty = property.format === 'eval'
      if (settingEvalProperty) {
        delete req.body[key]
      }

      if ((validPermissions && shouldSetValue) || settingUser || settingEvalProperty) {
        const value = await getModelPropertyValue({
          entityName: this.entityName,
          property,
          key,
          data: req.body,
          authUserId: req.auth?.id,
          ignoreDefault: action === 'update',
        })
        if (value !== undefined) {
          model[key as keyof T] = value
        }
      }

    }
    return model
  }

  protected getCreateEntityValidator (): ValidateFunction {
    if (!this.createEntityValidator) {
      // Remove system generated properties from required
      const required = this.config.schema.required || []
      for (const [key, property] of Object.entries(this.config.schema.properties || {})) {
        if (isSystemProperty(property)) {
          const index = required.indexOf(key)
          required.splice(index, 1)
        }
      }
      const createSchema = {
        ...this.config.schema,
        required,
      }
      this.createEntityValidator = getSchemaValidator({
        useDefaults: true,
      }, createSchema)
    }
    return this.createEntityValidator
  }

  protected getUpdateEntityValidator (): ValidateFunction {
    if (!this.updateEntityValidator) {
      const updateSchema = {
        ...this.config.schema,
        required: [],
      }
      this.updateEntityValidator = getSchemaValidator({
        useDefaults: false,
      }, updateSchema)
    }
    return this.updateEntityValidator
  }

  protected async prepareModelResponse (
    req: Request,
    auth: AuthPermissions,
    model: T,
    populate: { [P in keyof T]?: any } = {}
  ): Promise<T> {
    const item: { [key in keyof T]: any } = {} as T
    const properties = Object.entries(this.config.schema.properties || {})

    // Prepare properties
    for (const [key, property] of properties) {
      if (typeof property === 'boolean') {
        continue
      }
      const permissions = {
        ...this.config.permissions,
        ...(this.config.permissions?.properties?.[key] || {}),
        properties: undefined,
      }
      if (this.hasValidPermissions(auth, model, 'get', permissions)) {
        const modelKey = key as keyof T
        if (modelKey === 'id' || !isEntityRef(property)) {
          item[modelKey] = model[modelKey] === undefined || model[modelKey] === null ? property!.default : model[modelKey]
        } else if (!populate[modelKey] || !model[modelKey]) {
          item[modelKey] = model[modelKey] ? { id: model[modelKey] } : undefined
        } else {
          const populateEntityName = getEntityRef(property)!
          const populatedItem = await Commun.getEntityDao(populateEntityName).findOneById('' + model[modelKey])
          if (populatedItem) {
            item[modelKey] = await Commun.getEntityController(populateEntityName)
              .prepareModelResponse(req, auth, populatedItem, {})
          } else {
            item[modelKey] = { id: model[modelKey] }
          }
        }
        if (item[modelKey] === undefined) {
          delete item[modelKey]
        }
      }
    }

    // Prepare joinProperties
    for (const [key, joinProperty] of Object.entries(this.config.joinProperties || {})) {
      if (this.hasValidPermissions(auth, model, 'get',
        { ...this.config.permissions, ...joinProperty.permissions }
      )) {
        const joinedProperty = await getJoinProperty(joinProperty, model, req.auth?.id)
        if (joinedProperty) {
          const joinAttrController = Commun.getEntityController(joinProperty.entity)
          if (Array.isArray(joinedProperty)) {
            item[key as keyof T] = await Promise.all(joinedProperty.map(attr => joinAttrController.prepareModelResponse(req, auth, attr)))
          } else {
            item[key as keyof T] = await joinAttrController.prepareModelResponse(req, auth, joinedProperty)
          }
        }
      }
    }

    return item
  }

  protected getPopulateFromRequest (req: Request) {
    const populate: { [P in keyof T]?: any } = {}
    if (req.query.populate && typeof req.query.populate === 'string') {
      const populateKeys = req.query.populate.split(';')
      for (const key of populateKeys) {
        populate[key as keyof T] = true
      }
    }
    return populate
  }

  protected validateActionPermissions (auth: AuthPermissions, model: T | null, action: keyof EntityActionPermissions) {
    if (!this.hasValidPermissions(auth, model, action, this.config.permissions)) {
      throw new UnauthorizedError()
    }
  }

  protected hasValidPermissions (
    auth: AuthPermissions,
    model: T | null,
    action: keyof EntityActionPermissions,
    permissions?: EntityActionPermissions
  ) {
    if (!permissions?.[action]) {
      return false
    }

    const permission = permissions[action]

    const hasAnyoneAccess = Array.isArray(permission) ? permission.includes('anyone') : permission === 'anyone'
    if (hasAnyoneAccess) {
      return true
    }
    if (!auth.userId) {
      return false
    }

    const hasUserAccess = Array.isArray(permission) ? permission.includes('user') : permission === 'user'
    if (hasUserAccess) {
      return true
    }

    const hasOwnAccess = Array.isArray(permission) ? permission.includes('own') : permission === 'own'
    if (hasOwnAccess && model) {
      const userPropsEntries = Object.entries(this.config.schema.properties || {})
        .find(([key, property]) => {
          if (typeof property === 'boolean') {
            return false
          }
          if (this.config.schema.$id === '#entity/user') {
            return key === 'id'
          } else {
            return property.$ref === '#user'
          }
        })
      if (userPropsEntries?.[0]) {
        const userId = '' + model[userPropsEntries[0] as keyof T]
        if (userId && userId === auth.userId) {
          return true
        }
      }
    }

    const hasSystemOnlyAccess = Array.isArray(permission) ?
      !(permission as EntityPermission[]).find(permission => permission !== 'system') : permission === 'system'
    if (!hasSystemOnlyAccess) {
      return auth.isAdmin
    }

    return false
  }

  protected async getAuthPermissions (req: Request): Promise<AuthPermissions> {
    if (!req.auth?.id) {
      return {
        userId: null,
        isAdmin: false,
      }
    }
    const user = await Commun.getEntityDao<EntityModel & { admin: boolean }>('users').findOneById(req.auth.id)
    if (!user?.id) {
      return {
        userId: null,
        isAdmin: false,
      }
    }
    return {
      userId: user.id,
      isAdmin: user.admin,
    }
  }
}
