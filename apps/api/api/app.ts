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
import './models/index.js'

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
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error & { statusCode?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      error: 'O anexo excede o limite de 10MB.',
    })
    return
  }

  if (error.statusCode) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
    })
    return
  }

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
