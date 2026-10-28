export default {
  testDir: './tests/browser',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: '.ci/browser-results.json' }], ['junit', { outputFile: 'test-results/merged.xml' }]]
};
