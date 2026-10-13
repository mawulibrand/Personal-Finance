import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
export { Prisma } from './generated/client.js';
export function createDatabase(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
export type Database = ReturnType<typeof createDatabase>;
