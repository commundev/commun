import { ObjectId } from 'mongodb'
import { JSONSchema7, JSONSchema7Definition } from 'json-schema'
import Ajv, { Options as AjvOptions } from 'ajv'
import { parseConfigString } from './configVariables'
import { BadRequestError, ServerError } from '../errors'
import { Commun } from '../Commun'
import { SecurityUtils } from '../utils'

type ModelData<T> = { [P in keyof T]?: T[P] }

interface GetModelPropertyValueOptions<T> {
  entityName?: string
  property: JSONSchema7,
  data: ModelData<T>
  key: keyof T,
  authUserId?: string
  ignoreDefault?: boolean
}

export function getModelPropertyValue<T> (options: GetModelPropertyValueOptions<T>): any {
  const { property, data, key, authUserId, ignoreDefault } = options
  const defaultValue = ignoreDefault ? undefined : property.default

  if (property.$ref === '#user') {
    const userId = authUserId || defaultValue
    return userId ? new ObjectId(userId.toString()) : undefined
  }
  if (property.format === 'id') {
    const id = data[key] || defaultValue
    return id ? new ObjectId(id as string) : undefined
  }
  if (property.format === 'hash') {
    return formatHashProperty(options, defaultValue)
  }
  if (property.format?.startsWith('eval:')) {
    return formatEvalProperty(options, defaultValue)
  }

  const value = data[key] === undefined ? defaultValue : data[key]
  if (value !== undefined) {
    return parsePropertyValue(property, value)
  }
}

async function formatEvalProperty<T> (options: GetModelPropertyValueOptions<T>, defaultValue: any) {
  const expression = options.property.format?.substr(5)
  if (!expression) {
    return ''
  }
  let parsedValue
  try {
    parsedValue = await parseConfigString(expression, options.entityName || '', options.data, options.authUserId)
  } catch (e) {
    console.error(`Evaluation failed for property ${options.key}`, e)
    throw new ServerError()
  }

  if (!parsedValue) {
    if (options.property.required && defaultValue === undefined) {
      throw new BadRequestError(`${options.key} is required`)
    }
    return defaultValue
  }
  return parsedValue
}

function formatHashProperty<T> (options: GetModelPropertyValueOptions<T>, defaultValue: any) {
  const { data, key } = options
  const value = data[key] || defaultValue
  return SecurityUtils.hashWithBcrypt(value, 12)
}

/**
 * Return if a given property will be set by the system
 */
export function isSystemProperty (property: JSONSchema7Definition): boolean {
  if (typeof property === 'boolean') {
    return false
  }
  return property.$ref === '#user' || property.format?.startsWith('eval:') || false
}

export function parsePropertyValue (property: JSONSchema7Definition, value: any) {
  if (typeof property === 'boolean') {
    return value === true || value === 'true'
  }
  if (isEntityRef(property) || property.format === 'id') {
    return new ObjectId(value)
  }
  if (property.format === 'date-time') {
    return Number.isNaN(Number(value)) ? new Date(value) : new Date(Number(value))
  }
  switch (property.type) {
    case 'array':
      if (property.items && !Array.isArray(property.items)) {
        return value.map((valueItem: any) => parsePropertyValue(property.items as JSONSchema7Definition, valueItem))
      }
      return value
    case 'boolean':
      return value === true || value === 'true'
    case 'integer':
    case 'number':
      return Number(value)
    case 'null':
      return null
    case 'object':
      if (!property.properties) {
        return value
      }
      return Object.entries(property.properties)
        .reduce((prev: { [key: string]: any }, [key, objectProperty]) => {
          prev[key] = parsePropertyValue(objectProperty, value[key])
          return prev
        }, {})
    case 'string':
      return '' + value
    default:
      return value
  }
}

export function getSchemaValidator (options: AjvOptions, schema: JSONSchema7) {
  const evalFormats = Object.values(schema.properties || {})
    .map(property => (property as JSONSchema7).format)
    .filter(format => format?.startsWith('eval:')) as string[]
  return new Ajv({
    coerceTypes: true,
    unknownFormats: ['id', 'hash', ...evalFormats],
    format: 'fast',
    ...options,
  }).compile(schema)
}

export function isEntityRef (property: JSONSchema7Definition) {
  if (typeof property === 'boolean') {
    return false
  }
  return property.$ref?.startsWith('#entity/') || property.$ref === '#user'
}

export function getSingularEntityRef (property: JSONSchema7Definition) {
  if (!isEntityRef(property) || typeof property === 'boolean') {
    return
  }
  return property.$ref?.startsWith('#entity/') ?
    property.$ref?.substr('#entity/'.length) : 'user'
}

export function getEntityRef (property: JSONSchema7Definition) {
  const singularName = getSingularEntityRef(property)
  if (!singularName) {
    return
  }
  return singularName === 'user' ? 'users' : Commun.getPluralEntityName(singularName)
}

export function getSchemaDefinitions (): JSONSchema7['definitions'] {
  const definitions: JSONSchema7['definitions'] = {
    authUser: {
      $id: '#user',
      type: 'string',
      format: 'id',
    }
  }
  for (const entity of Object.values(Commun.getEntities())) {
    definitions[entity.config.entitySingularName!] = {
      $id: `#entity/${entity.config.entitySingularName!}`,
      type: 'string',
      format: 'id',
    }
  }
  return definitions
}
