import { randomBytes } from 'node:crypto'

const generateJwtSecret = (): string => {
  return randomBytes(64).toString('hex')
}

process.stdout.write(`${generateJwtSecret()}\n`)
