import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import type { Db } from './index';

/**
 * 按"行尾分号"拆分 SQL 语句(约定:导入 SQL 的字符串字面量内不含分号),
 * 丢弃纯注释块。云端(Railway Data 标签)直接整贴执行,不走本函数。
 */
export function splitSqlStatements(text: string): string[] {
  return text
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) =>
      chunk
        .split(/\r?\n/)
        .some((line) => line.trim().length > 0 && !line.trim().startsWith('--')));
}

/** 逐语句执行一个 SQL 文件(本地 PGlite / DATABASE_URL 均可);返回执行的语句数。 */
export async function runSqlFile(db: Db, filePath: string): Promise<number> {
  const text = fs.readFileSync(filePath, 'utf8');
  const statements = splitSqlStatements(text);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  return statements.length;
}
