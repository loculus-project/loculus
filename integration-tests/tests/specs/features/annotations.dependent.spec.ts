import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { test } from '../../fixtures/group.fixture';

test.describe('Sequence Preview Annotations', () => {
    test('should have an embl file in the Files section', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await searchPage.enableSearchFields(
            'Author affiliations',
            'Submitting group',
            'Submission ID',
        );

        // use this to find our pre-made sequence
        await searchPage.fill('Author affiliations', 'Patho Institute, Paris');

        const accessionVersion = await searchPage.clickOnSequenceAndGetAccession(0);
        const accession = accessionVersion.split('.')[0];

        await expect(page.getByTestId('sequence-preview-modal')).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
        await expect(
            page.getByTestId('sequence-preview-modal').getByText('Annotations'),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: `${accessionVersion}.embl` })).toBeVisible();

        const fileUrl = await page
            .getByRole('link', { name: `${accessionVersion}.embl` })
            .getAttribute('href');

        const resp = await fetch(fileUrl);
        const expected_content = EMBL_CONTENT.replace(/LOC_\w{6,10}/g, accession);
        expect(await resp.text()).toBe(expected_content);
    });
});

const EMBL_CONTENT = `
ID   LOC_000002W; ; linear; RNA; ; UNC; 910 BP.
XX
AC   LOC_000002W;
XX
DE   Original sequence submitted to Loculus with accession: LOC_000002W,
DE   version: 1
XX
OS   Sudan ebolavirus
OC   .
XX
RN   [1]
XX
FH   Key             Location/Qualifiers
FH
FT   source          1..910
FT                   /molecule_type="genomic RNA"
FT                   /organism="Sudan ebolavirus"
FT                   /country="France"
FT                   /collection_date="2021-05-12"
FT   gene            1..910
FT                   /gene="NP"
FT                   /product="NP"
FT   CDS             36..910
FT                   /gene="NP"
FT                   /product="nucleoprotein"
FT                   /protein_id="YP_138520.1"
FT                   /note="predominant component of nucleocapsid"
FT                   /codon_start=1
FT                   /translation="MDKRVRGSWALGGQSEVDLDYHKILTAGLSVQQGIVRQRVIPVYV
FT                   VSDLEGICQHIIQAFEAGVDFQDNADSFLLLLCLHHAYQGDHRLFLKSDAVQYLEGHGF
FT                   RFEVREKENVHRLDELLPNVTGGKNLRRTLAAMPEEETTEANAGQFLSFASLFLPKLVV
FT                   GEKACLEKVQRQIQVHAEQGLIQYPTSWQSVGHMMVIFRLMRTNFLIKFLLIHQGMHMV
FT                   AGHDANDTVISNSVAQARFSGLLIVKTVLDHILQKTDLGVRLHPLARTAKVKNEVSSFK
FT                   AALGSLAKHGEYAPFARLLNLS"
XX
SQ   
     atggataaac gggtgagagg ttcatgggcc ctgggaggac aatctgaagt tgatcttgac        60
     taccacaaaa tattaacagc cgggctttcg gtccaacaag ggattgtgcg acaaagagtc       120
     atcccggtat atgttgtgag tgatcttgag ggtatttgtc aacatatcat tcaggccttt       180
     gaagcaggcg tagatttcca agataatgct gacagcttcc ttttactttt atgtttacat       240
     catgcttacc aaggagatca taggctcttc ctcaaaagtg atgcagttca atacttagag       300
     ggccatggtt tcaggtttga ggtccgagaa aaggagaatg tgcaccgtct ggatgaattg       360
     ttgcccaatg tcaccggtgg aaaaaatctt aggagaacat tggctgcaat gcctgaagag       420
     gagacaacag aagctaatgc tggtcagttt ttatcctttg ccagtttgtt tctacccaaa       480
     cttgtcgttg gggagaaagc gtgtctggaa aaagtacaaa ggcagattca ggtccatgca       540
     gaacaagggc tcattcaata tccaacttcc tggcaatcag ttggacacat gatggtgatc       600
     ttccgtttga tgagaacaaa ctttttaatc aagttcctac taatacatca ggggatgcac       660
     atggtcgcag gccatgatgc gaatgacaca gtaatatcta attctgttgc ccaagcaagg       720
     ttctctggtc ttctgattgt aaagactgtt ctggaccaca tcctacaaaa aacagatctt       780
     ggagtacgac ttcatccact ggccaggaca gcaaaagtca agaatgaggt cagttcattc       840
     aaggcagctc ttggctcact tgccaagcat ggagaatatg ctccatttgc acgtctcctc       900
     aatctttctg                                                              910
//
`.trimStart();
