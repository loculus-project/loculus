#!/usr/bin/env python3
"""
Check the structure and basic syntax of the query engine
"""

import os
import ast
import sys

def check_python_syntax(file_path):
    """Check if a Python file has valid syntax"""
    try:
        with open(file_path, 'r') as f:
            source = f.read()
        ast.parse(source)
        return True, None
    except SyntaxError as e:
        return False, f"Syntax error: {e}"
    except Exception as e:
        return False, f"Error: {e}"

def main():
    """Check all Python files in the project"""
    print("Checking Query Engine Structure")
    print("=" * 40)
    
    # Find all Python files
    python_files = []
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    # Check syntax of each file
    all_good = True
    for file_path in python_files:
        is_valid, error = check_python_syntax(file_path)
        if is_valid:
            print(f"✓ {file_path}")
        else:
            print(f"✗ {file_path}: {error}")
            all_good = False
    
    # Check structure
    print(f"\nStructure Check:")
    required_files = [
        'src/__init__.py',
        'src/main.py',
        'src/config.py',
        'src/database.py', 
        'src/models.py',
        'src/query_builder.py',
        'src/routers/__init__.py',
        'src/routers/sample.py',
        'Dockerfile',
        'requirements.txt',
        'README.md'
    ]
    
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✓ {file_path}")
        else:
            print(f"✗ {file_path} (missing)")
            all_good = False
    
    print(f"\n{'='*40}")
    if all_good:
        print("✓ All structure checks passed!")
        print("The query engine is ready for deployment.")
        return 0
    else:
        print("✗ Some checks failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())