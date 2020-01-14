import { Commun, EntityActionPermissions, ModelAttribute, SecurityUtils } from '@commun/core'
import { BaseUserController, BaseUserModel, DefaultUserConfig, UserModule } from '../../src'
import { request } from '../test-helpers/requestHelpers'
import { EmailClient } from '@commun/emails'

type PromiseType<T> = T extends Promise<infer U> ? U : never

describe('BaseUserController', () => {
  const baseUrl = '/api/v1/auth'
  const entityName = 'users'
  const collectionName = 'users'
  let dbConnection: PromiseType<ReturnType<typeof Commun.connectDb>>

  const registerUserEntity = async (
    permissions: EntityActionPermissions,
    attributes: { [key in keyof BaseUserModel]: ModelAttribute } = DefaultUserConfig.attributes) => {
    UserModule.setup({
      config: {
        ...DefaultUserConfig,
        permissions,
        attributes,
      }
    }, {
      accessToken: {
        secretOrPrivateKey: 'SECRET'
      }
    })
    await Commun.createDbIndexes()
    Commun.configureRoutes()
  }

  const getDao = () => Commun.getEntityDao<BaseUserModel>(entityName)
  const getController = () => Commun.getEntityDao<BaseUserModel>(entityName)

  beforeAll(async () => {
    dbConnection = await Commun.connectDb()
  })

  afterEach(async () => {
    try {
      await dbConnection.getDb().collection(collectionName).drop()
    } catch (e) {}
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await Commun.closeDb()
  })

  describe('register with password - [POST] /auth/password', () => {
    it('should create an user', async () => {
      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'password',
      }
      const res = await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(200)
      expect(res.body.item.username).toBe('user')
      const user = (await getDao().findOne({ username: 'user' }))!
      expect(user.username).toBe('user')
      expect(user.email).toBe('user@example.org')
      expect(user.password).toBeDefined()
      expect(user.verified).toBe(false)
      expect(user.verificationCode).toBeDefined()
    })

    it('should return bad request without username', async () => {
      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(400)
    })

    it('should return bad request without email', async () => {
      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        email: 'user@example.org',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(400)
    })

    it('should return bad request without password', async () => {
      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        email: 'user@example.org',
      }
      await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(400)
    })

    it('should send a verification email', async () => {
      jest.spyOn(EmailClient, 'sendEmail')
      SecurityUtils.generateRandomString = jest.fn(() => Promise.resolve('plain-code'))

      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'password',
      }
      const res = await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(200)
      expect(EmailClient.sendEmail).toHaveBeenCalledWith('emailVerification', 'user@example.org', {
        _id: res.body.item._id,
        username: 'user',
        verificationCode: 'plain-code',
      })
    })
  })

  describe('login with password - [POST] /auth/password/login', () => {
    let userData: BaseUserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'hashed(password)',
        verified: true,
      }
      await getDao().insertOne(userData)
    })

    it('should return user and tokens if username and password are valid', async () => {
      const res = await request().post(`${baseUrl}/password/login`)
        .send({ username: 'user', password: 'password' })
        .expect(200)
      expect(res.body.user.username).toBe('user')
      expect(res.body.tokens.accessToken).toBeDefined()
      expect(res.body.tokens.accessTokenExpiration).toBeDefined()
      expect(res.body.tokens.refreshToken).toBeDefined()
    })

    it('should return user and tokens if email and password are valid', async () => {
      const res = await request().post(`${baseUrl}/password/login`)
        .send({ username: 'user@example.org', password: 'password' })
        .expect(200)
      expect(res.body.user.username).toBe('user')
      expect(res.body.tokens.accessToken).toBeDefined()
      expect(res.body.tokens.accessTokenExpiration).toBeDefined()
      expect(res.body.tokens.refreshToken).toBeDefined()
    })

    it('should return unauthorized error if password is not correct', async () => {
      const res = await request().post(`${baseUrl}/password/login`)
        .send({ username: 'user', password: 'wrong-password' })
        .expect(401)
    })
  })

  describe('get access token - [POST] /auth/token', () => {
    let userData: BaseUserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'password',
        verified: false,
        refreshTokenHash: 'hashed(REFRESH_TOKEN)'
      }
      await getDao().insertOne(userData)
    })

    it('should return the access token given a valid refresh token', async () => {
      const res = await request().post(`${baseUrl}/token`)
        .send({ username: userData.username, refreshToken: 'REFRESH_TOKEN' })
        .expect(200)
      expect(res.body.accessToken).toBeDefined()
      expect(res.body.accessTokenExpiration).toBeDefined()
    })

    it('should return an error if the refresh code is invalid', async () => {
      const res = await request().post(`${baseUrl}/token`)
        .send({ username: userData.username, refreshToken: 'INVALID_TOKEN' })
        .expect(401)
      expect(res.body.accessToken).toBeUndefined()
      expect(res.body.accessTokenExpiration).toBeUndefined()
    })
  })

  describe('verify - [POST] /auth/verify', () => {
    let fakeUser: BaseUserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'password',
        verified: false,
        verificationCode: 'hashed(CODE)'
      }
      fakeUser = await getDao().insertOne(userData)
    })

    it('should verify an user given a valid verification code', async () => {
      await request().post(`${baseUrl}/verify`)
        .send({ code: 'CODE', username: fakeUser.username })
        .expect(200)
      const user = (await getDao().findOne({ username: fakeUser.username }))!
      expect(user.verified).toBe(true)
      expect(user.verificationCode).toBeFalsy()
    })

    it('should return an error if the verification code is invalid', async () => {
      await request().post(`${baseUrl}/verify`)
        .send({ code: 'wrong-code', username: fakeUser.username })
        .expect(400)
      const user = (await getDao().findOne({ username: fakeUser.username }))!
      expect(user.verified).toBe(false)
      expect(user.verificationCode).toBe('hashed(CODE)')
    })

    it('should send a welcome email', async () => {
      jest.spyOn(EmailClient, 'sendEmail')

      await request().post(`${baseUrl}/verify`)
        .send({ code: 'CODE', username: fakeUser.username })
        .expect(200)

      expect(EmailClient.sendEmail).toHaveBeenCalledWith('welcomeEmail', 'user@example.org', {
        _id: fakeUser._id,
        username: 'user',
      })
    })
  })

  describe('reset password - [POST] /auth/password/reset', () => {
    let fakeUser: BaseUserModel

    beforeEach(async () => {
      SecurityUtils.hashWithBcrypt = jest.fn((str, saltRounds) => Promise.resolve(`hashed(${str}:${saltRounds})`))
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'old-password',
        verified: true,
        resetPasswordCodeHash: 'hashed(RESET_CODE)'
      }
      fakeUser = await getDao().insertOne(userData)
    })

    it('should set the new password given a valid reset code', async () => {
      await request().post(`${baseUrl}/password/reset`)
        .send({ username: fakeUser.username, code: 'RESET_CODE', password: 'new-password' })
        .expect(200)
      const user = await getDao().findOne({ username: fakeUser.username })
      expect(user!.password).toBe('hashed(new-password:12)')
    })

    it('should return an error if the reset code is invalid', async () => {
      await request().post(`${baseUrl}/password/reset`)
        .send({ username: fakeUser.username, code: 'INVALID_CODE' })
        .expect(401)
      const user = await getDao().findOne({ username: fakeUser.username })
      expect(user!.password).toBe('old-password')
    })
  })

  describe('forgot password - [POST] /auth/password/forgot', () => {
    it('should send a reset password email', async () => {
      jest.spyOn(EmailClient, 'sendEmail')
      SecurityUtils.generateRandomString = jest.fn(() => Promise.resolve('plain-code'))

      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'old-password',
        verified: true
      }
      const user = await getDao().insertOne(userData)

      await request().post(`${baseUrl}/password/forgot`)
        .send({ username: user.username })
        .expect(200)

      expect(EmailClient.sendEmail).toHaveBeenCalledWith('resetPassword', 'user@example.org', {
        _id: user._id,
        username: 'user',
        resetPasswordCode: 'plain-code',
      })
    })
  })

  describe('get - [GET] /users/:id', () => {
    it('should return an user by username', async () => {
      await registerUserEntity({ get: 'anyone', create: 'anyone' })
      const userData = {
        username: 'test-username',
        email: 'test-username@example.org',
        password: 'old-password',
        verified: true,
      }
      await getDao().insertOne(userData)
      const res = await request().get(`/api/v1/users/test-username`)
        .expect(200)
      expect(res.body.item.username).toBe('test-username')
      expect(res.body.item.password).toBeUndefined()
    })
  })
})