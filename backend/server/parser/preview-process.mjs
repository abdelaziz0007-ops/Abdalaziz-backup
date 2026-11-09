import {TableInputError, parseCsvTable, parseXlsxTable, tableLimits} from './tabular-core.mjs';
import {previewMapping} from './field-mapping.mjs';

// One JSON options line followed by the exact source bytes.
async function readRequest() {
  let header = Buffer.alloc(0);
  let options;
  const chunks = [];
  let size = 0;
  for await (let chunk of process.stdin) {
    if (!options) {
      const delimiter = chunk.indexOf(10);
      const end = delimiter < 0 ? chunk.length : delimiter;
      if (header.length + end > 16384) throw Error('Invalid request header');
      header = Buffer.concat([header, chunk.subarray(0, end)]);
      if (delimiter < 0) continue;
      options = JSON.parse(header.toString('utf8'));
      if (!options || !['csv', 'xlsx'].includes(options.format)) throw Error('Invalid source format');
      chunk = chunk.subarray(delimiter + 1);
    }
    size += chunk.length;
    if (size > tableLimits.bytes) throw new TableInputError('FILE_SIZE_LIMIT', 'Source exceeds the preview limit');
    chunks.push(chunk);
  }
  if (!options) throw Error('Missing request header');
  return {options, bytes: Buffer.concat(chunks, size)};
}

try {
  const {options, bytes} = await readRequest();
  const table = options.format === 'csv'
    ? parseCsvTable(bytes, options)
    : await parseXlsxTable(bytes, options);
  let data = options.mapping ? previewMapping(table, options.mapping) : table;
  if (options.importSheet) {
    const sheet = table.sheets.find(item => item.name === options.importSheet);
    if (!sheet || !data.completeSourcePreview || !data.rows.length) {
      throw new TableInputError('IMPORT_INCOMPLETE', 'A complete worksheet with at least one data row is required');
    }
    const byRow = new Map(sheet.rows.map(row => [row.rowNumber, row]));
    data = {
      ...data,
      dateSystem: table.dateSystem,
      rows: data.rows.map(({original: _original, ...row}) => ({...row, cells: byRow.get(row.rowNumber).cells})),
    };
  }
  process.stdout.write(JSON.stringify({data}));
} catch (error) {
  if (error instanceof TableInputError) {
    process.stdout.write(JSON.stringify({error: {code: error.code, message: error.message}}));
  } else {
    // Never emit uncaught parser exceptions or plaintext source bytes.
    process.exitCode = 1;
  }
}
