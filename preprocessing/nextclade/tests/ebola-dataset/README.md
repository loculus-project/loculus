# Test nextclade datasets

We use the very simple ebola dataset with only a reference and an alignment for testing. Additionally, we only look at a subset of the genes and they have been additionally annotated with their ebola subtype. For example the "NP" gene for the ebola-sudan subtype is annotated with "NPEbolaSudan", the "VP24" gene with "VP24EbolaZaire" etc. This should make testing easier.

Ebola was chosen as it is small (hence easy to review changes) but also as it has two common subtypes and the subtype can be determined with a minimizer. For testing the two subtypes can also be viewed as 2 different segments. 

For information about adding your own nextclade_dataset see [nextclade_data](https://github.com/nextstrain/nextclade_data).