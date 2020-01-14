import { EntityModel } from './EntityModel'
import { EntityActionPermissions } from './EntityPermission'
import { ModelAttribute } from './ModelAttribute'
import { EntityHook } from './EntityHooks'
import { JoinAttribute } from './JoinAttributes'

export interface EntityConfig<MODEL extends EntityModel> {
  entityName: string
  collectionName: string
  apiKey?: string
  permissions?: EntityActionPermissions
  attributes: {
    [key in keyof MODEL]: ModelAttribute
  }
  joinAttributes?: {
    [key: string]: JoinAttribute
  }
  indexes?: {
    keys: {
      [key in keyof MODEL]?: 1 | -1
    }
    unique?: boolean
    sparse?: boolean
    v?: number
    expireAfterSeconds?: number
    name?: string
    default_language?: string
  }[]
  beforeGet?: EntityHook[]
  afterGet?: EntityHook[]
  beforeCreate?: EntityHook[]
  afterCreate?: EntityHook[]
  beforeUpdate?: EntityHook[]
  afterUpdate?: EntityHook[]
  beforeDelete?: EntityHook[]
  afterDelete?: EntityHook[]
}