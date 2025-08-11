# Test nextclade datasets

We use a very simple ebola dataset with only a reference and basic gff3 file for testing. Additionally, the gff3 file has been cut to a subset of the genes and they have been additionally annotated with their ebola subtype. For example the "NP" gene for the ebola-sudan subtype is annotated with "NPEbolaSudan", the "VP24" gene with "VP24EbolaZaire" etc. This should make testing easier and keep the config more readable.

Ebola was chosen as it is small (hence easy to review changes) but also as it has two common subtypes and the subtype can be determined with a minimizer. For testing the two subtypes can also be viewed as 2 different segments. 

For information about adding your own nextclade_dataset see [nextclade_data](https://github.com/nextstrain/nextclade_data).