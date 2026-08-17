#!/bin/bash
# Generate PNG icons from SVG using macOS qlmanage / sips fallback.
# For development only — replace with proper icons before release.
SVG=icon.svg
mkdir -p .

# Use a Node script with sharp to render at all required sizes.
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sizes = [
  { name: '32x32.png', w: 32 },
  { name: '128x128.png', w: 128 },
  { name: '128x128@2x.png', w: 256 },
  { name: 'icon.png', w: 512 },
];

// Convert SVG to PNG using qlmanage (macOS).
const svgPath = path.resolve('icon.svg');
const tmpDir = fs.mkdtempSync('/tmp/githelm-icons-');
execSync(\`qlmanage -t -s 512 -o \${tmpDir} \${svgPath}\`, { stdio: 'inherit' });

for (const { name, w } of sizes) {
  const src = path.join(tmpDir, 'icon.svg.png');
  execSync(\`sips -z \${w} \${w} \${src} --out \${name}\`, { stdio: 'inherit' });
}

// .icns and .ico need dedicated tooling; copy the 128x png as fallback.
fs.copyFileSync('128x128@2x.png', 'icon.icns');
fs.copyFileSync('128x128.png', 'icon.ico');
console.log('icons generated');
"
