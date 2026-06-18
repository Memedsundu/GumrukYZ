import assert from 'node:assert/strict'
import { flattenExtractionFields } from './extracted-fields'

function testFlattensBusinessFieldsAndSkipsInternalSignals() {
  const fields = flattenExtractionFields({
    invoice_number: 'FI62026000000062',
    total_amount: 54556.03,
    _filename: 'invoice.pdf',
    items: [
      {
        description: 'AIR CHANNEL',
        gtip_code: '870829909000',
        quantity: 10,
      },
      {
        description: '',
        gtip_code: null,
        quantity: 5,
      },
    ],
  })

  assert.deepEqual(
    fields.map((field) => [field.fieldPath, field.normalizedValueText]),
    [
      ['invoice_number', 'FI62026000000062'],
      ['total_amount', '54556.03'],
      ['items[0].description', 'AIR CHANNEL'],
      ['items[0].gtip_code', '870829909000'],
      ['items[0].quantity', '10'],
      ['items[1].quantity', '5'],
    ],
  )
}

testFlattensBusinessFieldsAndSkipsInternalSignals()
console.log('extracted-fields tests passed')
