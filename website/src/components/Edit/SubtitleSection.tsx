import { type FC, type ReactNode } from 'react';

interface SubtitleSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

export const SubtitleSection: FC<SubtitleSectionProps> = ({ title, description, children }) => (
  <div className="grid sm:grid-cols-3 gap-x-16 gap-y-4 mb-4">
    <div>
      <h2 className="font-medium text-lg">{title}</h2>
      <p className="text-gray-500 text-sm">{description}</p>
    </div>
    <div className="col-span-2">
      {children}
    </div>
  </div>
);
