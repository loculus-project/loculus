# Developer Documentation

The diagrams are created with [plantuml](https://plantuml.com/) Version
`1.2023.11`.

## Installation

### Using jar

Download `plantuml.jar` from the following link and place it in the `backend/docs` directory.

<https://github.com/plantuml/plantuml/releases/tag/v1.2023.11>

### Apt (Ubuntu)

!NOTE! on ubuntu 22.04 the newest version via standard repositories is from 2020, see section manual installation for using a newer version.

To compile the plantuml diagrams into svg files, you need to install plantuml and graphviz.

You can install them with the following command:

```bash
sudo apt install plantuml graphviz
```

### brew (macOS)

```bash
brew install plantuml
```

## Compilation

### Jar

```bash
java -jar plantuml.jar -tsvg ./plantuml/*.puml
```

### Apt/Brew installed `plantuml`

```bash
plantuml -tsvg ./plantuml/*.puml
```

## Diagrams

The generated svg files will be in the same directory as the puml files and are referenced in the markdown files.

For the compiled documentation, see the [runtime_view](./runtime_view.md).
