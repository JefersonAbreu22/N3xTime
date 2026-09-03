/**
 * This is a API server
 */

import fs from 'fs'
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import recordRoutes from './routes/records.js'
import usersRoutes from './routes/users.js'
import departmentRoutes from './routes/departments.js'
import reportsRoutes from './routes/reports.js'
import companyRoutes from './routes/company.js'
import holidaysRoutes from './routes/holidays.js'
import requestsRoutes from './routes/requests.js'
import platformRoutes from './routes/platform.js'
import fileRoutes from './routes/files.js'
import emailRoutes from './routes/email.js'
import './models/index.js'
import { assertSecurityConfiguration, corsOptions } from './config/security.js'
import { sequelize } from './config/database.js'
import {
  apiRateLimiter,
  noStoreMiddleware,
  requestIdMiddleware,
  createSecurityHeaders,
} from './middlewares/security.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPathCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
]

const envPath = envPathCandidates.find((candidate) => fs.existsSync(candidate))

if (envPath) {
  dotenv.config({ path: envPath })
}

const app: express.Application = express()

assertSecurityConfiguration()

// Trust forwarding headers only when the immediate proxy is on the same host.
// This works with the local Apache/XAMPP reverse proxy without trusting arbitrary X-Forwarded-For values.
app.set('trust proxy', 'loopback')
app.set('query parser', 'simple')
app.disable('x-powered-by')

app.use(requestIdMiddleware)
app.use(createSecurityHeaders())
app.use(noStoreMiddleware)
app.use(cors(corsOptions))
app.use(apiRateLimiter)

// JSON requests in this API are small. File uploads continue to use Multer and keep their own limits.
app.use(express.json({ limit: '2mb', strict: true }))
app.use(express.urlencoded({ extended: false, limit: '2mb', parameterLimit: 100 }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/records', recordRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/holidays', holidaysRoutes)
app.use('/api/requests', requestsRoutes)
app.use('/api/platform', platformRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/email', emailRoutes)

/**
 * health
 */
app.get('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: 'ok' })
})

app.get('/api/health/live', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, status: 'live' })
})

app.get('/api/health/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    await sequelize.query('SELECT 1')
    res.status(200).json({ success: true, status: 'ready', database: 'ok' })
  } catch (error) {
    console.error('Readiness check failed', error)
    res.status(503).json({ success: false, status: 'not_ready', database: 'unavailable' })
  }
})

/**
 * error handler middleware
 */
app.use((error: Error & { status?: number; statusCode?: number; code?: string; type?: string }, req: Request, res: Response, _next: NextFunction) => {
  if (error.code === 'CORS_ORIGIN_DENIED') {
    res.status(403).json({
      success: false,
      error: 'Origem não autorizada.',
    })
    return
  }

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: 'JSON inválido.',
    })
    return
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: 'Payload excede o limite permitido.',
    })
    return
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      success: false,
      error: 'O arquivo excede o limite permitido para esta operação.',
    })
    return
  }

  const statusCode = error.statusCode ?? error.status
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    res.status(statusCode).json({
      success: false,
      error: error.message,
    })
    return
  }

  console.error('Unhandled API error', {
    requestId: res.getHeader('X-Request-Id'),
    method: req.method,
    path: req.originalUrl,
    error,
  })

  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
