import { EntityActionPermissions } from './EntityPermission'
import { JsonPrimitive } from './JsonPrimitive'

type BaseModelAttribute = {
  required?: boolean
  unique?: boolean
  index?: boolean
  readonly?: boolean
  permissions?: EntityActionPermissions
  default?: any
}

export type BooleanModelAttribute = BaseModelAttribute & {
  type: 'boolean',
  default?: boolean
}

export type EmailModelAttribute = BaseModelAttribute & {
  type: 'email'
  default?: string
}

export type EnumModelAttribute = BaseModelAttribute & {
  type: 'enum'
  values: JsonPrimitive[]
  default?: JsonPrimitive
}

export type IdModelAttribute = BaseModelAttribute & {
  type: 'id'
  permissions?: EntityActionPermissions
}

export type NumberModelAttribute = BaseModelAttribute & {
  type: 'number'
  min?: number
  max?: number
  default?: number
}

export type RefModelAttribute = BaseModelAttribute & {
  type: 'ref'
  entity: string
  default?: string
}

export type SlugModelAttribute = BaseModelAttribute & {
  type: 'slug'
  setFrom: string
  prefix?: {
    type: 'random'
    chars: number
  }
  suffix?: {
    type: 'random',
    chars: number
  }
  default?: string
}

export type StringModelAttribute = BaseModelAttribute & {
  type: 'string'
  maxLength?: number
  hash?: {
    algorithm: 'bcrypt',
    salt_rounds: number,
  }
  default?: string
}

export type UserModelAttribute = BaseModelAttribute & {
  type: 'user'
  default?: string
}

export type ModelAttribute =
  BooleanModelAttribute |
  EmailModelAttribute |
  EnumModelAttribute |
  IdModelAttribute |
  NumberModelAttribute |
  RefModelAttribute |
  SlugModelAttribute |
  StringModelAttribute |
  UserModelAttribute
