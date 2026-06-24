interface PageContainerProps {
  children: React.ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return <div className="space-y-6 p-4 md:p-6">{children}</div>;
}
