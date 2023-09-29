# Documentation

The diagrams are created with [plantuml](https://plantuml.com/) Version
`1.2023.10`. 

## Installation

### Manual Installation

Download `plantuml.jar` from the following link and place it in the `backend/docs` directory.

```https://github.com/plantuml/plantuml/releases/tag/v1.2023.10```

Run the following command to compile the diagrams:

```bash
java -jar plantuml.jar -tsvg ./plantuml/*.puml
```


### On Ubuntu

!NOTE! on ubuntu 22.04 the newest version via standard repositories is from 2020, see section manual installation for using a newer version.

To compile the plantuml diagrams into svg files, you need to install plantuml and graphviz.

you can install them with the following command:

```bash
sudo apt install plantuml graphviz
```

Then, you can compile the diagrams with the following command:

```bash 
 plantuml -tsvg ./plantuml/*.puml
```


## Diagrams

The generated svg files will be in the same directory as the puml files and are referenced in the markdown files.

For the compiled documentation, see the [runtime_view](./runtime_view.md) 

