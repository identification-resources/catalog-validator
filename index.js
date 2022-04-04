const spdxLicenseList = require('spdx-license-list')
const chalk = require('chalk')
const ietfTagList = require('ietf-language-tag-regex')()

const FORMATS = {
  ENTRY_TYPE: ['print', 'online', 'cd'],
  KEY_TYPE: ['key', 'matrix', 'reference', 'gallery', 'checklist', 'supplement', 'collection'],
  COMPLETE: ['TRUE', 'FALSE'],

  ID: /^B\d+$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  EDTF_0: /^(\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[-+]\d{2}(:\d{2})?))?)?)?|\d{4}(-\d{2}(-\d{2})?)?\/\d{4}(-\d{2}(-\d{2})?)?)$/,
  ISSN_L: /^[0-9]{4}-[0-9]{3}[0-9X]$/,
  ISBN: /^(\d{13}|\d{9}[0-9X])$/,
  DOI: /^10\./,
  QID: /^Q[1-9][0-9]*$/,

  LICENSE (value) { return spdxLicenseList[value] },
  LANGUAGE (value) { return ietfTagList.test(value) }
}

const CHECK = {
  MULTILANG (entry) { return entry.language.length > 1 },

  ISBN (entry) {
    if (entry.ISBN.length < 2) { return false }
    const a = entry.ISBN.length[0].length === 10
    const b = entry.ISBN.length[0].length === 13
    const c = entry.ISBN.length[1].length === 10
    const d = entry.ISBN.length[1].length === 13
    return (a && d) || (b && c)
  }
}

const SCHEMA = {
  catalog: {
    id: { required: true, multiple: false, format: FORMATS.ID },
    title: { required: true, multiple: CHECK.MULTILANG },
    author: { required: false, multiple: true},
    url: { required: false, multiple: true, format: FORMATS.URL },
    fulltext_url: { required: false, multiple: true, format: FORMATS.URL },
    archive_url: { required: false, multiple: true, format: FORMATS.URL },
    entry_type: { required: true, multiple: false, format: FORMATS.ENTRY_TYPE },
    date: { required: false, multiple: false, format: FORMATS.EDTF_0 },
    publisher: { required: false, multiple: true },
    series: { required: false, multiple: false },
    ISSN: { required: false, multiple: false, format: FORMATS.ISSN_L },
    ISBN: { required: false, multiple: CHECK.ISBN, format: FORMATS.ISBN },
    DOI: { required: false, multiple: false, format: FORMATS.DOI },
    QID: { required: false, multiple: false, format: FORMATS.QID },
    volume: { required: false, multiple: false },
    issue: { required: false, multiple: false },
    pages: { required: false, multiple: false },
    edition: { required: false, multiple: false },
    language: { required: true, multiple: true, format: FORMATS.LANGUAGE },
    license: { required: false, multiple: true, format: FORMATS.LICENSE },
    key_type: { required: true, multiple: true, format: FORMATS.KEY_TYPE },
    taxon: { required: true, multiple: true },
    scope: { required: false, multiple: true },
    region: { required: true, multiple: true },
    complete: { required: false, multiple: false, format: FORMATS.COMPLETE },
    target_taxa: { required: false, multiple: true },
    part_of: { required: false, multiple: true, format: FORMATS.ID }
  },
  authors: {
    name: { required: true, multiple: false },
    qid: { required: false, multiple: false, format: FORMATS.QID },
    main_full_name: { required: false, multiple: false },
    full_names: { required: false, multiple: true }
  },
  publishers: {
    name: { required: true, multiple: false },
    qid: { required: false, multiple: false, format: FORMATS.QID },
    full_name: { required: false, multiple: false },
    long_name: { required: false, multiple: true }
  },
  places: {
    name: { required: true, multiple: false },
    qid: { required: false, multiple: false, format: FORMATS.QID },
    display_name: { required: false, multiple: false }
  }
}

function validateValue (entry, sheet, field, value) {
  if (!SCHEMA[sheet][field].format) {
    return
  } else if (Array.isArray(SCHEMA[sheet][field].format) && !SCHEMA[sheet][field].format.includes(value)) {
    throw new Error(`The value "${chalk.green(value)}" is not included: ${chalk.yellow(SCHEMA[sheet][field].format.join(', '))}`)
  } else if (SCHEMA[sheet][field].format instanceof RegExp && !SCHEMA[sheet][field].format.test(value)) {
    throw new Error(`The value "${chalk.green(value)}" does not conform to pattern: ${chalk.yellow(SCHEMA[sheet][field].format.source)}`)
  } else if (typeof SCHEMA[sheet][field].format === 'function' && !SCHEMA[sheet][field].format(value)) {
    throw new Error(`The value "${chalk.green(value)}" does not conform to pattern: ${chalk.yellow(SCHEMA[sheet][field].format.name)}`)
  }
}

function validateField (entry, sheet, field) {
  if (SCHEMA[sheet][field].required && !entry[field].toString()) {
    throw new Error(`Value(s) required but missing`)
  } else if (!entry[field].toString()) {
    return
  }

  const multiple = typeof SCHEMA[sheet][field].multiple === 'function'
    ? SCHEMA[sheet][field].multiple(entry)
    : SCHEMA[sheet][field].multiple

  if (multiple === false && entry[field].includes('; ')) {
    throw new Error(`Multiple values but only one expected`)
  }

  if (Array.isArray(entry[field])) {
    const errors = []
    for (const value of entry[field]) {
      try {
        validateValue(entry, sheet, field, value)
      } catch (error) {
        errors.push(error.message)
      }
    }
    if (errors.length) {
      throw new Error(errors.join('; '))
    }
  } else {
    validateValue(entry, sheet, field, entry[field])
  }
}

function validateEntry (entry, sheet) {
  const errors = []
  for (const field in entry) {
    try {
      validateField(entry, sheet, field)
    } catch (error) {
      errors.push(`${chalk.blue(field)}: ${error.message}`)
    }
  }
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
}

function parseEntry (row, sheet) {
  const entry = {}
  for (const field in SCHEMA[sheet]) {
    let value = row.shift()
    value = SCHEMA[sheet][field].multiple ? value.split('; ') : value
    entry[field] = value
  }
  return entry
}

function parseFile (file) {
  return file
    .trim()
    .match(/("([^"]|"")*?"|[^,\n]*)(,|\n|$)/g)
    .slice(0, -1)
    .reduce((rows, value) => {
      const last = rows[rows.length - 1]
      if (value.endsWith('\n')) {
        rows.push([])
      }
      value = value.replace(/[,\n]$/, '')
      last.push(value.startsWith('"') ? value.replace(/""/g, '"').slice(1, -1) : value)
      return rows
    }, [[]])
    .slice(1)
}

function validate (file, sheet) {
  const entries = parseFile(file)

  const errors = []
  for (const entry of entries) {
    try {
      validateEntry(parseEntry(entry.slice(), sheet), sheet)
    } catch (error) {
      errors.push(`${chalk.black.bgWhite('=====', entry[0], '=====')}${'\n'}${error.message}`)
    }
  }
  if (errors.length) {
    throw new Error('\n' + errors.join('\n\n'))
  }
}

module.exports = validate
