import React from 'react';

interface AcceptanceOfTermsProps {
  termsMessage: string;
  onAgreeChange: (agreed: boolean) => void;
}

const AcceptanceOfTerms: React.FC<AcceptanceOfTermsProps> = ({ termsMessage, onAgreeChange }) => {
  return (
    <div style={{ marginLeft: "1.5em", marginRight: "1.5em" }}>
      <div dangerouslySetInnerHTML={{ __html: termsMessage }}></div>
      <div>
        <label>
          <input
            type="checkbox"
            id="terms"
            name="terms"
            onChange={(e) => onAgreeChange(e.target.checked)}
          /> I agree
        </label>
      </div>
    </div>
  );
};

export default AcceptanceOfTerms;