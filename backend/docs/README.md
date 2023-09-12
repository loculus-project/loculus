To compile the plantuml diagrams into svg files, you need to install plantuml and graphviz.

On Ubuntu, you can install them with the following command:

```bash
sudo apt install plantuml graphviz
```

Then, you can compile the diagrams with the following command:

```bash
 plantuml -tsvg ./plantuml/*.puml
```

The generated svg files will be in the same directory as the puml files and are referenced in the markdown files. 


For the compiled documentation, see the [runtime_view](./runtime_view.md) 


