/**
 * Codemod to replace native <button> elements with wrapped <Button> component
 *
 * This ensures buttons are disabled until React hydration completes, preventing
 * race conditions in Playwright tests that cause Firefox flakes.
 *
 * Usage:
 *   npx jscodeshift -t codemods/migrate-button-to-wrapper.cjs src --extensions=tsx --parser=tsx
 *
 * Or for a dry run:
 *   npx jscodeshift -t codemods/migrate-button-to-wrapper.cjs src --extensions=tsx --parser=tsx --dry --print
 */

const path = require('path');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Skip the Button.tsx wrapper file itself
  if (file.path.includes('src/components/common/Button.tsx')) {
    return;
  }

  // Find all <button> JSX elements (handles nested buttons automatically)
  const buttonElements = root.find(j.JSXElement, {
    openingElement: { name: { name: 'button' } }
  });

  // If no button elements found, no changes needed
  if (buttonElements.length === 0) {
    return;
  }

  let hasChanges = false;

  // Replace <button> with <Button>
  buttonElements.forEach(path => {
    hasChanges = true;

    // Update opening element
    path.value.openingElement.name.name = 'Button';

    // Update closing element if it exists (not self-closing)
    if (path.value.closingElement) {
      path.value.closingElement.name.name = 'Button';
    }
  });

  if (!hasChanges) {
    return;
  }

  // Check if Button is already imported
  const existingButtonImport = root.find(j.ImportDeclaration).filter(path => {
    const source = path.value.source.value;
    // Check for any import that ends with /Button or /Button.tsx or ./Button
    return typeof source === 'string' &&
           (source.endsWith('/Button') ||
            source.endsWith('/Button.tsx') ||
            source === './Button');
  });

  if (existingButtonImport.length > 0) {
    // Button already imported, we're done
    return root.toSource();
  }

  // Calculate the correct relative import path
  const currentFilePath = file.path;
  const buttonComponentPath = path.join(
    path.dirname(currentFilePath),
    '../../src/components/common/Button.tsx'
  );

  // Get directory of current file relative to project root
  const currentDir = path.dirname(currentFilePath);
  const targetPath = path.join(process.cwd(), 'src/components/common/Button.tsx');

  // Calculate relative path from current file to Button component
  let relativePath = path.relative(currentDir, targetPath);

  // Remove .tsx extension
  relativePath = relativePath.replace(/\.tsx$/, '');

  // Ensure path starts with ./ or ../
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  // Create the import statement with the correct relative path
  const newImport = j.importDeclaration(
    [j.importSpecifier(j.identifier('Button'))],
    j.literal(relativePath)
  );

  // Find the first import statement to insert after
  const firstImport = root.find(j.ImportDeclaration).at(0);

  if (firstImport.length > 0) {
    // Insert after first import (before internal imports)
    firstImport.insertAfter(newImport);
  } else {
    // No imports exist, insert at the beginning
    root.get().node.program.body.unshift(newImport);
  }

  return root.toSource();
};
