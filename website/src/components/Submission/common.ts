import { routes } from '../../routes/routes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

export type Action = 'submit' | 'revise';

export const getElements = () => {
    const byId = (id: string) => document.getElementById(id);
    return {
        submitButton: byId('submitButton') as HTMLButtonElement,
        loadingSpinner: byId('loadingSpinner') as HTMLDivElement,
        uploadForm: byId('dataUploadForm') as HTMLFormElement,
        errorMessage: byId('dataUploadFormErrorMessage') as HTMLDivElement,
        uploadComponent: {
            input: (name: string) => byId('uploadComponentInput-' + name) as HTMLInputElement,
            filename: (name: string) => byId('uploadComponentFileName-' + name) as HTMLDivElement,
            fileUnset: (name: string) => byId('uploadComponentFileUnset-' + name) as HTMLDivElement,
            fileSet: (name: string) => byId('uploadComponentFileSet-' + name) as HTMLDivElement,
        },
        devExampleData: {
            load: byId('exampleDataLoadButton') as HTMLButtonElement,
            message: byId('exampleDataLoadedMessage') as HTMLSpanElement,
            numberEntries: byId('exampleDataNumber') as HTMLInputElement,
        },
    };
};

export function setIsLoading(isLoading: boolean) {
    const elements = getElements();
    if (isLoading) {
        elements.submitButton.setAttribute('disabled', 'true');
        elements.loadingSpinner.classList.remove('invisible');
    } else {
        elements.submitButton.removeAttribute('disabled');
        elements.loadingSpinner.classList.add('invisible');
    }
}

export function setErrorMessage(error: string | undefined) {
    const el = getElements().errorMessage;
    if (error === undefined) {
        el.classList.add('hidden');
        el.innerHTML = '';
    } else {
        el.classList.remove('hidden');
        el.innerHTML = error;
    }
}

export async function submit(
    clientConfig: ClientConfig,
    action: Action,
    formData: FormData,
    organism: string,
    accessToken: string,
    groupId: number,
) {
    const url = `${clientConfig.backendUrl}/${organism}/${action}`;
    const bearer = `Bearer ${accessToken}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: bearer,
        },
        body: formData,
    });
    const content = await response.json();
    if (!response.ok) {
        setIsLoading(false);
        setErrorMessage(content.detail);
        return;
    }
    window.location.href = routes.userSequenceReviewPage(organism, groupId);
}

export function setInputFile(fieldName: string, filename: string | undefined) {
    const elements = getElements().uploadComponent;
    if (filename !== undefined) {
        elements.filename(fieldName).innerHTML = filename;
        elements.fileUnset(fieldName).classList.add('hidden');
        elements.fileSet(fieldName).classList.remove('hidden');
    } else {
        elements.fileUnset(fieldName).classList.remove('hidden');
        elements.fileSet(fieldName).classList.add('hidden');
    }
}
