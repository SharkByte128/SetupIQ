const postgres = require('postgres');
const sql = postgres('postgres://setupiq:setupiq@localhost:5432/setupiq');

async function main() {
  try {
    const rows = await sql.unsafe('SELECT id, name, type, base_url, enabled FROM vendor_sources ORDER BY name');
    console.table(rows);
  } catch (e) {
    console.error('Error:', e.message, e.code, e.stack);
  } finally {
    await sql.end();
  }
}
main();
