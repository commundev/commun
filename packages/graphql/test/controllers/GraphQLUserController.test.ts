import { authenticatedRequest, closeTestApp, getTestApp, startTestApp, stopTestApp } from '@commun/test-utils'
import { GraphQLModule } from '../../src'
import { Commun, ConfigManager } from '@commun/core'
import { UserConfig, UserController, UserModel } from '@commun/users'

describe('GraphQLUserController', () => {
  let entityName = 'users'
  let user: UserModel
  let controller = new UserController<UserModel>(entityName)

  beforeAll(async () => {
    ConfigManager._writeFile = jest.fn(() => Promise.resolve())
    ConfigManager._mkdir = jest.fn(() => Promise.resolve()) as jest.Mock
    ConfigManager._readFile = jest.fn(() => Promise.resolve('test')) as jest.Mock
    ConfigManager._exists = jest.fn(() => Promise.resolve(true)) as jest.Mock
    ConfigManager.setRootPath('/test-project/lib')
    Commun.registerEntity<UserModel>({
      controller,
      config: {
        ...UserConfig,
        permissions: {
          get: 'anyone',
          create: 'anyone',
          update: 'own',
          delete: 'own',
        },
      }
    })
    await startTestApp(Commun)
    process.env.NODE_ENV = 'development'
    await GraphQLModule.setupGraphql(getTestApp())

    user = await getDao().insertOne({
      username: 'test',
      email: 'test@example.org',
      verified: true,
    })
  })
  afterEach(async () => await stopTestApp('users'))
  afterAll(closeTestApp)

  const getDao = () => Commun.getEntityDao<UserModel>(entityName)

  describe('getViewer', () => {
    it('should return the current viewer', async () => {
      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `{
               viewer {
                 username
               }
             }`
        })
        .expect(200)
      expect(res.body.data.viewer.username).toBe('test')
    })
  })

  describe('getAccessToken', () => {
    it('should return an access token', async () => {
      const time = new Date().getTime()
      controller.getAccessToken = jest.fn(() => Promise.resolve({
        accessToken: 'test-access-token',
        accessTokenExpiration: time,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `{
               accessToken (username: "test", refreshToken: "refresh-token") {
                 accessToken
                 accessTokenExpiration
               }
             }`
        })
        .expect(200)
      expect(res.body.data.accessToken.accessToken).toBe('test-access-token')
      expect(res.body.data.accessToken.accessTokenExpiration).toBe(time)
    })
  })

  describe('login', () => {
    it('should return the access and refresh token', async () => {
      controller.loginWithPassword = jest.fn(() => Promise.resolve({
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
        },
        user,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               login (username: "test", password: "password") {
                 tokens {
                   accessToken
                   refreshToken 
                 }
                 user {
                   username
                 }
               }
             }`
        })
        .expect(200)
      expect(res.body.data.login.tokens.accessToken).toBe('test-access-token')
      expect(res.body.data.login.tokens.refreshToken).toBe('test-refresh-token')
      expect(res.body.data.login.user.username).toBe('test')
    })
  })

  describe('logout', () => {
    it('should logout the user', async () => {
      controller.logout = jest.fn(() => Promise.resolve({
        result: true,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               logout {
                 result
               }
             }`
        })
        .expect(200)
      expect(res.body.data.logout.result).toBe(true)
    })
  })

  describe('verifyEmail', () => {
    it('should verify the user\'s email', async () => {
      controller.verify = jest.fn(() => Promise.resolve({
        result: true,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               verifyEmail (username: "test", code: "code") {
                 result
               }
             }`
        })
        .expect(200)
      expect(res.body.data.verifyEmail.result).toBe(true)
    })
  })

  describe('sendResetPasswordEmail', () => {
    it('should send a reset password email', async () => {
      controller.forgotPassword = jest.fn(() => Promise.resolve({
        result: true,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               sendResetPasswordEmail (username: "test") {
                 result
               }
             }`
        })
        .expect(200)
      expect(res.body.data.sendResetPasswordEmail.result).toBe(true)
    })
  })

  describe('resetPassword', () => {
    it('should reset the user\'s password', async () => {
      controller.resetPassword = jest.fn(() => Promise.resolve({
        result: true,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               resetPassword (username: "test", password: "password", code: "code") {
                 result
               }
             }`
        })
        .expect(200)
      expect(res.body.data.resetPassword.result).toBe(true)
    })
  })

  describe('completeSocialAuthentication', () => {
    it('should complete the social authentication', async () => {
      const time = new Date().getTime()
      controller.generateAccessTokenForAuthWithProvider = jest.fn(() => Promise.resolve({
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          accessTokenExpiration: time,
        },
        user,
      }))

      const res = await authenticatedRequest(user.id!.toString())
        .post('/graphql')
        .send({
          query:
            `mutation {
               completeSocialAuthentication (provider: "google", username: "test", code: "code") {
                 tokens {
                   accessToken
                   refreshToken 
                   accessTokenExpiration
                 }
                 user {
                   username
                 }
               }
             }`
        })
        .expect(200)
      expect(res.body.data.completeSocialAuthentication.tokens.accessToken).toBe('test-access-token')
      expect(res.body.data.completeSocialAuthentication.tokens.refreshToken).toBe('test-refresh-token')
      expect(res.body.data.completeSocialAuthentication.tokens.accessTokenExpiration).toBe(time)
      expect(res.body.data.completeSocialAuthentication.user.username).toBe('test')
    })
  })
})