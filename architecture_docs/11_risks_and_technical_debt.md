# Risks and Technical Debt

## Configuration Processing

We use a `values.yaml` file as a main input source for the Helm chart for the configuration of a Loculus instance.

We leveraged the powerful templating capabilities of Helm to generate the configuration files for the individual artifacts.
This works well, because we can distribute the mostly redundant configuration values efficiently.

However, this became quite complex and hard to maintain over time.
It is untested and hard to debug, if something goes wrong.
It is also (as of now) mostly undocumented.

Some parts of the configuration are redundant and could be simplified.
Also, the Helm chart contains a lot of default values 
that are not suitable for general Loculus instances and will result in unexpected behavior if not overwritten.
