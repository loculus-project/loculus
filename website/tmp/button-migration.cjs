/**
 * Codemod to replace <button> elements with <Button> component from src/components/common/Button
 *
 * Usage: npx jscodeshift -t tmp/button-migration.cjs src --extensions=tsx --parser=tsx
 */

module.exports = function transformer(file, api) {
    const j = api.jscodeshift;
    const root = j(file.source);

    // Skip the Button.tsx wrapper file itself
    if (file.path.includes('src/components/common/Button.tsx')) {
        return;
    }

    // Find all <button> JSX elements
    const buttonElements = root.find(j.JSXElement, {
        openingElement: { name: { name: 'button' } },
    });

    // If no button elements found, no changes needed
    if (buttonElements.length === 0) {
        return;
    }

    let hasChanges = false;

    // Replace <button> with <Button>
    buttonElements.forEach((path) => {
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
    const buttonImport = root.find(j.ImportDeclaration, {
        source: { value: (value) => value.includes('/components/common/Button') },
    });

    if (buttonImport.length === 0) {
        // Add import for Button component
        const newImport = j.importDeclaration(
            [j.importSpecifier(j.identifier('Button'))],
            j.literal('src/components/common/Button'),
        );

        // Find the first import statement to insert after
        const firstImport = root.find(j.ImportDeclaration).at(0);

        if (firstImport.length > 0) {
            // Insert after first import
            firstImport.insertAfter(newImport);
        } else {
            // No imports exist, insert at the beginning
            root.get().node.program.body.unshift(newImport);
        }
    }

    return root.toSource();
};
