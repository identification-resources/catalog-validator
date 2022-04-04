#!/usr/bin/env node

const fs = require('fs').promises
const path = require('path')
const validate = require('./index.js')

async function main (args) {
  const filePath = path.resolve(args[0])
  const file = await fs.readFile(filePath, 'utf8')
  const sheet = path.basename(filePath, '.csv')
  validate(file, sheet)
}

main(process.argv.slice(2))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
