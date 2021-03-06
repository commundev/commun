import { GraphQLInputObjectType, GraphQLNonNull } from 'graphql/type/definition'
import { GraphQLBoolean, GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLString } from 'graphql'
import { Request } from 'express'
import { Entity, EntityModel } from '@commun/core'
import { capitalize } from '../utils/StringUtils'
import { pageInfoType } from '../graphql-types/PageInfo'
import graphqlFields from 'graphql-fields'

export const GraphQLController = {
  listEntities (
    entity: Entity<EntityModel>,
    entityType: GraphQLObjectType,
    getEntityInput?: GraphQLInputObjectType,
    filterByEntityInput?: GraphQLInputObjectType,
    orderByEntityInput?: GraphQLInputObjectType
  ) {
    const args: any = {
      first: { type: GraphQLInt },
      last: { type: GraphQLInt },
      before: { type: GraphQLString },
      after: { type: GraphQLString },
    }
    if (getEntityInput) {
      args.filter = {
        type: filterByEntityInput,
      }
    }
    if (orderByEntityInput) {
      args.orderBy = {
        type: new GraphQLList(orderByEntityInput),
      }
    }
    const supportsTextSearch = entity.config.indexes?.find(index => Object.values(index.keys).includes('text'))
    if (supportsTextSearch) {
      args.search = {
        type: GraphQLString
      }
    }

    return {
      type: new GraphQLObjectType({
        name: `${capitalize(entity.config.entitySingularName!)}Connection`,
        fields: {
          nodes: {
            type: new GraphQLNonNull(new GraphQLList(entityType))
          },
          pageInfo: {
            type: pageInfoType,
          },
          totalCount: {
            type: new GraphQLNonNull(GraphQLInt),
            description: 'Returns the total count of items in the connection.'
          },
        }
      }),
      args,
      resolve: async (parentValue: any, args: any, req: Request, info: any) => {
        const requestedKeys = graphqlFields(info)
        req.query = args
        if (args.orderBy) {
          req.query.orderBy = args.orderBy
            .map((orderBy: { [key: string]: 'asc' | 'desc' }) => Object.entries(orderBy).map(entry => entry.join(':')).join(';'))
            .join(';')
        }
        const res = await entity.controller.list(req, requestedKeys)
        const data = {
          ...res,
          nodes: res.items
        }
        delete data.items
        return data
      },
      description: `Find ${capitalize(entity.config.entityName)}.`
    }
  },

  getEntity (entity: Entity<EntityModel>, entityType: GraphQLObjectType) {
    const apiKey = entity.config.apiKey || 'id'
    return {
      type: new GraphQLNonNull(entityType),
      args: {
        [apiKey]: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: async (_: any, args: any, req: Request) => {
        req.params = {
          id: args[apiKey]
        }
        const res = await entity.controller.get(req)
        return res.item
      },
      description: `Find a ${capitalize(entity.config.entitySingularName!)} by ${apiKey}.`,
    }
  },

  createEntity (entity: Entity<EntityModel>, entityType: GraphQLObjectType, entityInput?: GraphQLInputObjectType) {
    return {
      type: new GraphQLObjectType({
        name: `Create${capitalize(entity.config.entitySingularName!)}Payload`,
        fields: {
          [entity.config.entitySingularName!]: {
            type: entityType
          }
        }
      }),
      args: {
        ...(entityInput && { input: { type: entityInput } }),
      },
      resolve: async (_: any, args: any, req: Request) => {
        req.body = args.input
        const res = await entity.controller.create(req)
        return {
          [entity.config.entitySingularName!]: res.item
        }
      },
      description: `Create a ${capitalize(entity.config.entitySingularName!)}.`
    }
  },

  updateEntity (entity: Entity<EntityModel>, entityType: GraphQLObjectType, entityInput?: GraphQLInputObjectType) {
    return {
      type: new GraphQLObjectType({
        name: `Update${capitalize(entity.config.entitySingularName!)}Payload`,
        fields: {
          [entity.config.entitySingularName!]: {
            type: entityType
          }
        }
      }),
      args: {
        ...(entityInput && { input: { type: entityInput } }),
      },
      resolve: async (_: any, args: any, req: Request) => {
        const apiKey = entity.config.apiKey || 'id'
        req.params = {
          id: args.input[apiKey]
        }
        delete args.input[apiKey]
        req.body = args.input
        const res = await entity.controller.update(req)
        return {
          [entity.config.entitySingularName!]: res.item
        }
      },
      description: `Update a ${capitalize(entity.config.entitySingularName!)}.`
    }
  },

  deleteEntity (entity: Entity<EntityModel>, entityType: GraphQLObjectType, entityInput?: GraphQLInputObjectType) {
    return {
      type: new GraphQLObjectType({
        name: `Delete${capitalize(entity.config.entitySingularName!)}Payload`,
        fields: {
          result: {
            type: new GraphQLNonNull(GraphQLBoolean)
          }
        }
      }),
      args: {
        ...(entityInput && { input: { type: entityInput } }),
      },
      resolve: async (_: any, args: any, req: Request) => {
        const apiKey = entity.config.apiKey || 'id'
        req.params = {
          id: args.input[apiKey]
        }
        delete args.input[apiKey]
        req.body = args.input
        return await entity.controller.delete(req)
      },
      description: `Delete a ${capitalize(entity.config.entitySingularName!)}.`
    }
  },
}
