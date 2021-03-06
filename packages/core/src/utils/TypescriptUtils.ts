import { JSONSchema4, JSONSchema7 } from 'json-schema'
import { capitalize } from './StringUtils'
import { compile, Options as CompileOptions } from 'json-schema-to-typescript'
import deepcopy from 'deepcopy'
import { ConfigManager, Entity, EntityModel, getSingularEntityRef, isEntityRef } from '..'

export const assertNever = (x: never): never => {
  throw new Error('[assertNever] Unexpected object: ' + x)
}

function prepareSchemaForTypings (schema: JSONSchema7, dbSchema: boolean): JSONSchema7 {
  for (const [key, property] of Object.entries(schema.properties || {})) {
    if (typeof property === 'boolean') {
      continue
    }
    if (isEntityRef(property)) {
      if (dbSchema) {
        schema.properties![key] = {
          ...(property as JSONSchema7),
          $ref: undefined,
          type: 'string',
          format: 'id',
        }
      } else {
        ;(schema.properties as any)[key] = {
          ...(property as JSONSchema7),
          $ref: undefined,
          tsType: capitalize(getSingularEntityRef(property)!),
        }
      }
    }

    // recursively prepare for objects and arrays
    if (property.properties) {
      property.properties = prepareSchemaForTypings(property, dbSchema).properties
    }
    if (property.items && typeof property.items !== 'boolean') {
      if (Array.isArray(property.items)) {
        property.items.map(item => prepareSchemaForTypings(item as JSONSchema7, dbSchema))
      } else {
        property.items = prepareSchemaForTypings(property.items, dbSchema)
      }
    }

    // Map date-time properties to Date https://github.com/bcherny/json-schema-to-typescript/issues/183
    if (['date-time'].includes(property.format || '')) {
      ;(property as any).tsType = 'Date'
    }
  }
  if (!schema.additionalProperties) {
    schema.additionalProperties = false
  }
  return schema
}

export const generateJsonSchemaTypings = async (entities: { [key: string]: Entity<EntityModel> }) => {
  const compileOptions: Partial<CompileOptions> = {
    style: {
      semi: false,
      singleQuote: true,
    },
    bannerComment: '',
  }
  const bannerComment = '// auto-generated by Commun using json-schema-to-typescript\n\n'

  let typingModule = bannerComment
  let dbTypingsModule = bannerComment

  for (const entity of Object.values(entities)) {
    try {
      // Generate typings for entities.d.ts
      const schemaCopy = deepcopy(entity.config.schema)
      schemaCopy.required = ['id', ...(schemaCopy.required || [])]
      const schema = prepareSchemaForTypings(schemaCopy, false)
      const typings = await compile(schema as JSONSchema4, schema.title!, compileOptions)
      typingModule += typings + '\n'

      // Generate typings for entitiesDB.d.ts
      const dbSchemaCopy = {
        ...deepcopy(entity.config.schema),
        required: ['id', ...(entity.config.schema.required || [])],
        title: entity.config.schema.title + 'DB',
      }
      const dbSchema = prepareSchemaForTypings(dbSchemaCopy, true)
      const dbTypings = await compile(dbSchema as JSONSchema4, dbSchemaCopy.title, compileOptions)
      dbTypingsModule += dbTypings + '\n'
    } catch (e) {
      console.warn(`Error generating typings for ${entity.config.entityName}`, e)
    }
  }

  await ConfigManager.writeGeneratedFile('entities.d.ts', typingModule, true)
  await ConfigManager.writeGeneratedFile('entitiesDB.d.ts', dbTypingsModule, true)
}
