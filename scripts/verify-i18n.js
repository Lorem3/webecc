const fs = require('fs');
const path = require('path');

function hasChineseChar(str) {
  return /[\u4e00-\u9fa5]/.test(str);
}

let failed = false;
const issues = [];

// Check en/**/*.html for Chinese characters
const enDir = 'www/en';
if (fs.existsSync(enDir)) {
  function walkDir(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        walkDir(fullPath);
      } else if (file.name.endsWith('.html')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (hasChineseChar(content)) {
          issues.push(`[FAIL] en output contains Chinese characters: ${fullPath}`);
          failed = true;
        }
      }
    }
  }
  walkDir(enDir);
}

// Check for unreplaced i18n placeholders
function checkPlaceholders(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      checkPlaceholders(fullPath);
    } else if (file.name.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (/\{\{i18n:\w+\}\}/.test(content)) {
        issues.push(`[FAIL] Unreplaced i18n placeholder: ${fullPath}`);
        failed = true;
      }
      if (/\[\[MISSING:\w+\]\]/.test(content)) {
        issues.push(`[FAIL] Missing i18n key: ${fullPath}`);
        failed = true;
      }
    }
  }
}
checkPlaceholders('www');

// Check cn and en have same number of HTML pages
const cnPages = fs.existsSync('www/cn')
  ? fs.readdirSync('www/cn').filter(f => f.endsWith('.html')).sort()
  : [];
const enPages = fs.existsSync('www/en')
  ? fs.readdirSync('www/en').filter(f => f.endsWith('.html')).sort()
  : [];

if (JSON.stringify(cnPages) !== JSON.stringify(enPages)) {
  issues.push(`[FAIL] cn and en have different pages: cn=[${cnPages}] en=[${enPages}]`);
  failed = true;
}

// Report
if (failed) {
  for (const issue of issues) {
    console.error(issue);
  }
  console.error(`\nVerification FAILED: ${issues.length} issue(s) found`);
  process.exit(1);
} else {
  console.log('i18n verification passed');
  console.log(`  - ${cnPages.length} pages in cn/`);
  console.log(`  - ${enPages.length} pages in en/`);
  console.log('  - No Chinese characters in en/ output');
  console.log('  - No unreplaced i18n placeholders');
}
