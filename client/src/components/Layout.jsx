import Header from './Header';

export default function Layout({ headerContent, showDueAlert, children }) {
  return (
    <div className="font-sans min-h-screen">
      <Header headerContent={headerContent} showDueAlert={showDueAlert} />
      <main className="container mx-auto px-4 max-w-3xl fade-in pb-24 mt-8">
        {children}
      </main>
    </div>
  );
}
