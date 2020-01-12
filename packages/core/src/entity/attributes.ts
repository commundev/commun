import {
  BooleanModelAttribute,
  EmailModelAttribute,
  ModelAttribute,
  NumberModelAttribute,
  RefModelAttribute,
  SlugModelAttribute,
  StringModelAttribute,
  UserModelAttribute
} from '../types'
import { BadRequestError, NotFoundError } from '../errors'
import { assertNever, SecurityUtils } from '../utils'
import * as EmailValidator from 'email-validator'
import { ObjectId } from 'mongodb'
import S from 'string'
import { Commun } from '../Commun'

type ModelData<T> = { [P in keyof T]?: T[P] }

export async function getModelAttribute<T> (attribute: ModelAttribute, key: keyof T, data: ModelData<T>, userId?: string) {
  switch (attribute.type) {
    case 'boolean':
      return getBooleanModelAttribute(attribute, key, data[key])
    case 'email':
      return getEmailModelAttribute(attribute, key, data[key])
    case 'number':
      return getNumberModelAttribute(attribute, key, data[key])
    case 'ref':
      return getRefModelAttribute(attribute, key, data[key])
    case 'slug':
      return getSlugModelAttribute(attribute, key, data)
    case 'string':
      return getStringModelAttribute(attribute, key, data[key])
    case 'user':
      return getUserModelAttribute(attribute, key, data[key], userId)
    default:
      assertNever(attribute)
  }
}

function getBooleanModelAttribute<T> (attribute: BooleanModelAttribute, key: keyof T, value: any) {
  if ([undefined, null].includes(value)) {
    if (attribute.required) {
      throw new BadRequestError(`${key} is required`)
    }
    return undefined
  }

  const validValues = [true, false, 'true', 'false']
  if (!validValues.includes(value)) {
    throw new BadRequestError(`${key} must be boolean`)
  }

  return parseModelAttribute(attribute, value)
}

function getEmailModelAttribute<T> (attribute: EmailModelAttribute, key: keyof T, value: any) {
  if (!value) {
    if (attribute.required) {
      throw new BadRequestError(`${key} is required`)
    }
    return undefined
  }

  const email = value.trim()
  if (!EmailValidator.validate(email)) {
    throw new BadRequestError(`${key} is not a valid email address`)
  }
  return email
}

function getNumberModelAttribute<T> (attribute: NumberModelAttribute, key: keyof T, value: any) {
  if ([undefined, null].includes(value)) {
    if (attribute.required) {
      throw new BadRequestError(`${key} is required`)
    }
    return undefined
  }

  const parsedValue = Number(value)
  if ([true, false].includes(value) || Number.isNaN(parsedValue)) {
    throw new BadRequestError(`${key} must be a number`)
  }
  if (attribute.min !== undefined && parsedValue < attribute.min) {
    throw new BadRequestError(`${key} must be larger or equal than ${attribute.min}`)
  }
  if (attribute.max !== undefined && parsedValue > attribute.max) {
    throw new BadRequestError(`${key} must be smaller or equal than ${attribute.max}`)
  }
  return parsedValue
}

async function getRefModelAttribute<T> (attribute: RefModelAttribute, key: keyof T, value: any) {
  if (attribute.required && !value) {
    throw new BadRequestError(`${key} is required`)
  }
  if (!value) {
    return
  }
  if (!ObjectId.isValid(value)) {
    throw new BadRequestError(`${key} is not a valid ID`)
  }
  const item = await Commun.getEntityDao(attribute.entity).findOne({ _id: new ObjectId(value) })
  if (!item) {
    throw new NotFoundError(`${key} not found`)
  }
  return new ObjectId(value)
}

async function getSlugModelAttribute<T> (attribute: SlugModelAttribute, key: keyof T, data: ModelData<T>) {
  const targetData = '' + data[attribute.setFrom as keyof T]
  let slug: string = ''
  if (targetData) {
    slug = S(targetData.trim()).slugify().s
  }
  if (attribute.prefix?.type === 'random') {
    slug = (await SecurityUtils.generateRandomString(attribute.prefix.chars)) + '-' + slug
  }
  if (attribute.suffix?.type === 'random') {
    slug += '-' + (await SecurityUtils.generateRandomString(attribute.suffix.chars))
  }
  if (attribute.required && !slug) {
    throw new BadRequestError(`${key} is required`)
  }
  return slug
}

async function getStringModelAttribute<T> (attribute: StringModelAttribute, key: keyof T, value: any) {
  const parsedValue = value?.toString()?.trim()
  if ([undefined, null, ''].includes(parsedValue)) {
    if (attribute.required) {
      throw new BadRequestError(`${key} is required`)
    }
    return parsedValue === '' ? '' : undefined
  }

  if (attribute.maxLength !== undefined && parsedValue.length > attribute.maxLength) {
    throw new BadRequestError(`${key} must be shorter than ${attribute.maxLength} characters`)
  }

  if (attribute.hash) {
    switch (attribute.hash.algorithm) {
      case 'bcrypt':
        return await SecurityUtils.hashWithBcrypt(value, attribute.hash.salt_rounds)
      default:
        assertNever(attribute.hash.algorithm)
    }
  }

  return parsedValue
}

async function getUserModelAttribute<T> (attribute: UserModelAttribute, key: keyof T, value: any, userId?: string) {
  if (attribute.required && !userId) {
    throw new BadRequestError(`${key} is required`)
  }
  if (userId) {
    return parseModelAttribute(attribute, userId)
  }
}

export function parseModelAttribute (attribute: ModelAttribute, value: any) {
  switch (attribute.type) {
    case 'boolean':
      return value === true || value === 'true'
    case 'string':
    case 'email':
    case 'slug':
      return '' + value
    case 'number':
      return Number(value)
    case 'ref':
    case 'user':
      return new ObjectId(value)
    default:
      assertNever(attribute)
  }
}
