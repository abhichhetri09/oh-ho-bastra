// A template (unlike the layout) remounts on every navigation, so each page
// fades in as it's opened. CSS, so it plays before hydration too.
export default function ShopTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-page-in flex flex-1 flex-col">{children}</div>;
}
