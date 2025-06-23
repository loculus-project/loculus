import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview Annotations', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test.only('should have an embl file in the Files section', async ({ page }) => {
        await searchPage.ebolaSudan();

        const loculus_id = await searchPage.clickOnSequence(0);
        const accession = loculus_id.split('.')[0];

        await expect(page.getByTestId('sequence-preview-modal')).toBeVisible();

        await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
        await expect(
            page.getByTestId('sequence-preview-modal').getByText('Annotations'),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: /LOC_[\w.]{6,10}\.embl/ })).toBeVisible();

        const fileUrl = await page
            .getByRole('link', { name: /LOC_[\w.]{6,10}\.embl/ })
            .getAttribute('href');

        const resp = await fetch(fileUrl);
        const expected_content = EMBL_CONTENT.replace(/LOC_\w{6,10}/g, accession);
        expect(await resp.text()).toBe(expected_content);
    });
});

const EMBL_CONTENT = `
ID   LOC_000002W; ; linear; RNA; ; UNC; 945 BP.
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
FT   source          1..945
FT                   /molecule_type="genomic RNA"
FT                   /organism="Sudan ebolavirus"
FT                   /country="France"
FT                   /collection_date="2021-05-12"
FT   gene            1..945
FT                   /gene="NP"
FT                   /product="NP"
FT                   /codon_start=1
FT   CDS             36..945
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
     nnnnnnnnnn nnnnnnnnnn nnnnnnnnnn nnnnnatgga taaacgggtg agaggttcat        60
     gggccctggg aggacaatct gaagttgatc ttgactacca caaaatatta acagccgggc       120
     tttcggtcca acaagggatt gtgcgacaaa gagtcatccc ggtatatgtt gtgagtgatc       180
     ttgagggtat ttgtcaacat atcattcagg cctttgaagc aggcgtagat ttccaagata       240
     atgctgacag cttcctttta cttttatgtt tacatcatgc ttaccaagga gatcataggc       300
     tcttcctcaa aagtgatgca gttcaatact tagagggcca tggtttcagg tttgaggtcc       360
     gagaaaagga gaatgtgcac cgtctggatg aattgttgcc caatgtcacc ggtggaaaaa       420
     atcttaggag aacattggct gcaatgcctg aagaggagac aacagaagct aatgctggtc       480
     agtttttatc ctttgccagt ttgtttctac ccaaacttgt cgttggggag aaagcgtgtc       540
     tggaaaaagt acaaaggcag attcaggtcc atgcagaaca agggctcatt caatatccaa       600
     cttcctggca atcagttgga cacatgatgg tgatcttccg tttgatgaga acaaactttt       660
     taatcaagtt cctactaata catcagggga tgcacatggt cgcaggccat gatgcgaatg       720
     acacagtaat atctaattct gttgcccaag caaggttctc tggtcttctg attgtaaaga       780
     ctgttctgga ccacatccta caaaaaacag atcttggagt acgacttcat ccactggcca       840
     ggacagcaaa agtcaagaat gaggtcagtt cattcaaggc agctcttggc tcacttgcca       900
     agcatggaga atatgctcca tttgcacgtc tcctcaatct ttctg                       945
//
`.trimStart();
