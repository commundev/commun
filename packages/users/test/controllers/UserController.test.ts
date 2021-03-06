import { Commun, ConfigManager, SecurityUtils } from '@commun/core'
import { AuthProvider, UserConfig, UserController, UserModel, UserModule } from '../../src'
import { EmailClient } from '@commun/emails'
import { authenticatedRequest, closeTestApp, prepareDb, request, startTestApp } from '@commun/test-utils'
import { AccessTokenSecurity } from '../../src/security/AccessTokenSecurity'
import passport from 'passport'
import { NextFunction, Request, Response } from 'express'
import { ExternalAuth } from '../../src/security/ExternalAuth'

describe('UserController', () => {
  const baseUrl = '/api/v1/auth'
  const entityName = 'users'

  const registerUserEntity = async () => {
    await UserModule.setup({
      accessToken: {
        expiresIn: '3 days',
        algorithm: 'RS256',
      },
      refreshToken: {
        enabled: true
      }
    }, {
      config: {
        ...UserConfig,
        permissions: {
          get: 'anyone',
          create: 'anyone',
          ...UserConfig.permissions,
        }
      }
    })
    UserModule.accessTokenKeys = {
      publicKey: 'public',
      privateKey: {
        key: 'private',
        passphrase: 'secret'
      }
    }
    AccessTokenSecurity.sign = jest.fn(() => Promise.resolve('signed-token'))
    await Commun.createDbIndexes()
    Commun.configureRoutes()
  }

  const getDao = () => Commun.getEntityDao<UserModel>(entityName)

  beforeAll(async () => {
    ConfigManager.getKeys = jest.fn(() => Promise.resolve({ publicKey: 'public', privateKey: 'private' }))
    await startTestApp(Commun)
  })
  beforeEach(async () => await prepareDb())
  afterAll(closeTestApp)

  describe('register with password - [POST] /auth/password', () => {
    it('should create an user', async () => {
      await registerUserEntity()
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
      await registerUserEntity()
      const userData = {
        username: 'user',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(400)
    })

    it('should return bad request without email', async () => {
      await registerUserEntity()
      const userData = {
        email: 'user@example.org',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(400)
    })

    it('should return bad request without password', async () => {
      await registerUserEntity()
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
      SecurityUtils.generateRandomString = jest.fn(() => 'plain-code')

      await registerUserEntity()
      const userData = {
        username: 'user',
        email: 'user@example.org',
        password: 'password',
      }
      const res = await request().post(`${baseUrl}/password`)
        .send(userData)
        .expect(200)
      expect(EmailClient.sendEmail).toHaveBeenCalledWith('emailVerification', 'user@example.org', {
        id: res.body.item.id,
        username: 'user',
        verificationCode: 'plain-code',
        createdAt: expect.any(Date),
      })
    })

    it('should validate usernames', async () => {
      await registerUserEntity()
      const validUserData = {
        username: 'User.123_456',
        email: 'user.123_456@example.org',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`).send(validUserData).expect(200)

      await registerUserEntity()
      const invalidUserData1 = {
        username: 'User 123',
        email: 'user.123@example.org',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`).send(invalidUserData1).expect(400)

      await registerUserEntity()
      const invalidUserData2 = {
        username: 'User@123',
        email: 'user123@example.org',
        password: 'password',
      }
      await request().post(`${baseUrl}/password`).send(invalidUserData2).expect(400)
    })
  })

  describe('login with password - [POST] /auth/password/login', () => {
    let userData: UserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity()
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
      expect(AccessTokenSecurity.sign).toHaveBeenCalledWith({ id: res.body.user.id })
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

  describe('logout - [POST] /auth/password/logout', () => {
    let user: UserModel

    beforeEach(async () => {
      await registerUserEntity()
      user = await getDao().insertOne({
        username: 'user',
        email: 'user@example.org',
        refreshTokenHash: 'refresh-token',
        verified: true,
      })
    })

    it('should invalidate the refresh token', async () => {
      const res = await authenticatedRequest(user.id).post(`${baseUrl}/logout`)
        .expect(200)
      const updatedUser = await getDao().findOneById(user.id!)
      expect(updatedUser!.refreshTokenHash).toBe(null)
    })
  })

  describe('get access token - [POST] /auth/token', () => {
    let userData: UserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity()
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
    let fakeUser: UserModel

    beforeEach(async () => {
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity()
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
        id: fakeUser.id,
        username: 'user',
        createdAt: expect.any(Date),
      })
    })
  })

  describe('reset password - [POST] /auth/password/reset', () => {
    let fakeUser: UserModel

    beforeEach(async () => {
      SecurityUtils.hashWithBcrypt = jest.fn((str, saltRounds) => Promise.resolve(`hashed(${str}:${saltRounds})`))
      SecurityUtils.bcryptHashIsValid = jest.fn((code, hash) => Promise.resolve(hash === `hashed(${code})`))

      await registerUserEntity()
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
      SecurityUtils.generateRandomString = jest.fn(() => 'plain-code')

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
        id: user.id,
        username: 'user',
        resetPasswordCode: 'plain-code',
        createdAt: expect.any(Date),
      })
    })
  })

  describe('get - [GET] /users/:id', () => {
    it('should return an user by username', async () => {
      await registerUserEntity()
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

  describe('authenticateWithProvider - [GET] /auth/:provider/callback', () => {
    it('should start the passport authentication with the given provider', async () => {
      passport.authenticate = jest.fn((provider: AuthProvider) =>
        (req: Request, res: Response, next: NextFunction) => {
          res.send({ result: `Authenticated with ${provider}` })
        }) as jest.Mock
      const res = await request()
        .get(`${baseUrl}/google/callback`)
        .expect(200)
      expect(res.body.result).toBe('Authenticated with google')
    })
  })

  describe('generateAccessTokenForAuthWithProvider - [POST] /auth/:provider/token', () => {
    beforeEach(async () => {
      await registerUserEntity()
      const userData = {
        username: 'test',
        email: 'user@example.org',
        verified: true,
        providers: {
          google: {
            id: 'id'
          }
        }
      }
      await getDao().insertOne(userData)
    })

    it('should return an access token given a valid external auth code', async () => {
      ExternalAuth.verify = jest.fn(() => Promise.resolve({
        user: {
          email: 'user@example.org'
        } as UserModel,
        provider: {
          key: 'google',
          id: 'id'
        },
        userCreated: true
      }))
      const res = await request()
        .post(`${baseUrl}/google/token`)
        .send({ code: 'secret-code' })
        .expect(200)
      expect(res.body).toEqual({
        user: expect.any(Object),
        tokens: {
          accessToken: 'signed-token',
          accessTokenExpiration: expect.any(Number),
          refreshToken: 'plain-code',
        }
      })
      expect(Math.round(res.body.tokens.accessTokenExpiration / 10000))
        .toBe(Math.round((new Date().getTime() + 259200000) / 10000))
    })

    it('should return a client error if the user does not exist', async () => {
      ExternalAuth.verify = jest.fn(() => Promise.resolve({
        user: {
          email: 'bad-user@example.org'
        } as UserModel,
        provider: {
          key: 'google',
          id: 'id'
        },
        userCreated: true
      }))
      await request()
        .post(`${baseUrl}/google/token`)
        .send({ code: 'secret-code' })
        .expect(404)
    })

    it('should return a client error if the provider ID does not match', async () => {
      ExternalAuth.verify = jest.fn(() => Promise.resolve({
        user: {
          email: 'user@example.org'
        } as UserModel,
        provider: {
          key: 'google',
          id: 'bad-id'
        },
        userCreated: true
      }))
      await request()
        .post(`${baseUrl}/google/token`)
        .send({ code: 'secret-code' })
        .expect(400)
    })

    it('should create the user if it was not created', async () => {
      ExternalAuth.verify = jest.fn(() => Promise.resolve({
        user: {
          email: 'new-user@example.org'
        } as UserModel,
        provider: {
          key: 'google',
          id: 'id'
        },
        userCreated: false
      }))
      const res = await request()
        .post(`${baseUrl}/google/token`)
        .send({ code: 'secret-code', username: 'new-user' })
        .expect(200)
      expect(res.body).toEqual({
        user: {
          id: expect.any(String),
          username: 'new-user',
          createdAt: expect.anything(),
          admin: false,
          email: 'new-user@example.org',
        },
        tokens: {
          accessToken: 'signed-token',
          accessTokenExpiration: expect.any(Number),
          refreshToken: 'plain-code',
        }
      })

      const user = await getDao().findOne({ username: 'new-user' })
      expect(user!.username).toBe('new-user')
      expect(user!.email).toBe('new-user@example.org')
    })
  })
})
