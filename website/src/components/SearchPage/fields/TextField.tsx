import { FloatingLabel, floatingLabelTheme } from 'flowbite-react';
import {
    useId,
    forwardRef,
    useEffect,
    useState,
    type FocusEvent,
    type ForwardedRef,
    type LegacyRef,
    type FocusEventHandler,
    type ChangeEventHandler,
    type ClipboardEvent,
} from 'react';

interface TextFieldProps {
    label?: string;
    disabled?: boolean;
    onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    autoComplete?: string;
    fieldValue?: string | number | readonly string[];
    className?: string;
    onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    multiline?: boolean;
    onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    type?: string;
}

const inputClasses = floatingLabelTheme.input.default.outlined.md;
const labelClasses = floatingLabelTheme.label.default.outlined.md;

export const TextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(function (props, ref) {
    const { label, disabled, onChange, autoComplete, fieldValue, className, onFocus, multiline, onBlur } = props;
    const id = useId();
    const [isTransitionEnabled, setIsTransitionEnabled] = useState(false);
    const [hasFocus, setHasFocus] = useState(false);
    const numericTypes = ['number', 'int', 'float'];
    const inputType = props.type !== undefined && numericTypes.includes(props.type) ? 'number' : 'text';

    useEffect(() => {
        const timeout = setTimeout(() => {
            setIsTransitionEnabled(true);
        }, 100); // Adjust the delay as needed

        return () => clearTimeout(timeout);
    }, []);

    const standardOnFocus = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setHasFocus(true);
        if (onFocus) {
            onFocus(event);
        }
    };
    const standardOnBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setHasFocus(false);
        if (onBlur) {
            onBlur(event);
        }
    };

    const inputOnFocus = standardOnFocus as (event: FocusEvent<HTMLInputElement>) => void;
    const inputOnBlur = standardOnBlur as (event: FocusEvent<HTMLInputElement>) => void;

    const handleChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> = (event) => {
        if (props.type === 'int') {
            const value = event.target.value;
            const intValue = parseInt(value, 10);
            if (!isNaN(intValue)) {
                event.target.value = intValue.toString();
            } else {
                event.target.value = '';
            }
        }
        if (onChange) {
            onChange(event);
        }
    };

    const standardProps = {
        onChange: handleChange,
        autoComplete,
        disabled,
    };

    if (multiline === false || multiline === undefined) {
        const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
            const pasteData = event.clipboardData.getData('text');
            const cleanedData = pasteData.replace(/[\r\n]+/g, '');

            if (pasteData !== cleanedData) {
                event.preventDefault();
                const input = event.currentTarget;
                const selectionStart = input.selectionStart ?? 0;
                const selectionEnd = input.selectionEnd ?? 0;

                const value = input.value;
                const newValue = value.substring(0, selectionStart) + cleanedData + value.substring(selectionEnd);

                // eslint-disable-next-line @typescript-eslint/unbound-method
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    'value',
                )?.set;
                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(input, newValue);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Set cursor position after the pasted content
                setTimeout(() => {
                    input.setSelectionRange(selectionStart + cleanedData.length, selectionStart + cleanedData.length);
                }, 0);
            }
        };

        const inputProps = {
            ...standardProps,
            onFocus: inputOnFocus,
            onBlur: inputOnBlur,
            onPaste: handlePaste,
            ref: ref as LegacyRef<HTMLInputElement>,
            label: label ?? '',
            step: props.type === 'int' ? 1 : undefined,
            placeholder: ' ', // Label already serves as placeholder
        };

        return (
            <div className='[&_label]:pointer-events-none my-1.5'>
                <FloatingLabel
                    theme={{
                        input: {
                            default: {
                                outlined: {
                                    md: `${inputClasses} focus:border-blue-600! hover:border-gray-400 transition-colors`,
                                },
                            },
                        },
                        label: {
                            default: {
                                outlined: {
                                    md: `${labelClasses} peer-focus:text-blue-600! bg-white! dark:bg-gray-900! peer-placeholder-shown:bg-transparent! peer-focus:bg-white! dark:peer-focus:bg-gray-900!`,
                                },
                            },
                        },
                    }}
                    {...inputProps}
                    variant='outlined'
                    type={inputType}
                    value={fieldValue}
                />
            </div>
        );
    }
    const refTextArea = ref as ForwardedRef<HTMLTextAreaElement>;

    const onFocusHTMLArea = standardOnFocus as (event: FocusEvent<HTMLTextAreaElement>) => void;
    const onBlurHTMLArea = standardOnBlur as (event: FocusEvent<HTMLTextAreaElement>) => void;

    const textareaProps = {
        ...standardProps,
        id,
        ref: refTextArea,
        onFocus: onFocusHTMLArea,
        onBlur: onBlurHTMLArea,
        value: fieldValue,
        placeholder: ' ', // Label already serves as placeholder
    };

    return (
        <div className='relative my-2'>
            <textarea
                {...textareaProps}
                rows={hasFocus || (fieldValue !== undefined && fieldValue.toString().split('\n').length > 1) ? 4 : 1}
                className={`rounded-md block px-2.5 pb-2 pt-4 w-full text-sm text-gray-900 bg-transparent border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-hidden focus:ring-0 focus:border-blue-600 peer hover:border-gray-400 transition-colors ${className}`}
            ></textarea>

            <label
                htmlFor={id}
                className={`absolute text-sm text-gray-500 dark:text-gray-400 pointer-events-none ${
                    isTransitionEnabled ? 'duration-300' : ''
                } transform -translate-y-3 scale-75 top-1 z-10 origin-left bg-white! dark:bg-gray-900! px-2 peer-focus:px-2 peer-focus:bg-white! dark:peer-focus:bg-gray-900! peer-focus:text-blue-600 dark:peer-focus:text-blue-500 peer-placeholder-shown:bg-transparent! peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-1 peer-focus:scale-75 peer-focus:-translate-y-3 inset-s-1 peer-focus:rtl:translate-x-1/4 peer-focus:rtl:left-auto`}
            >
                {label}
            </label>
        </div>
    );
});
