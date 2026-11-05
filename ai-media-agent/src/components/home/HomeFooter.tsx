export function HomeFooter() {
  return (
    <footer className="border-t border-warm-600/15 px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-warm-500 sm:flex-row">
        <p>© {new Date().getFullYear()} AI Media Agent. 版權所有。</p>
        <p>企業專屬 AI 媒體製作平台</p>
      </div>
    </footer>
  );
}
