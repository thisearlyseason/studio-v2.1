const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.tsx', 'utf-8');

// 1. Theme state & Toggle Button
code = code.replace(
  `const [activeTab, setActiveTab] = useState<'accounts' | 'beta' | 'bugs'>('accounts');`,
  `const [activeTab, setActiveTab] = useState<'accounts' | 'beta' | 'bugs'>('accounts');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');`
);

code = code.replace(
  `<Button size="sm" variant="ghost" className="text-white/40 hover:text-white" onClick={() => router.push('/dashboard')}>`,
  `<Button size="sm" variant="ghost" className="text-gray-500 dark:text-white/40 hover:text-black dark:hover:text-white mr-2" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
    </Button>
    <Button size="sm" variant="ghost" className="text-gray-500 dark:text-white/40 hover:text-black dark:hover:text-white" onClick={() => router.push('/dashboard')}>`
);

code = code.replace(
  `<div className="min-h-screen bg-[#0a0a0a]">`,
  `<div className={\`min-h-screen \${theme === 'dark' ? 'dark bg-[#0a0a0a]' : 'bg-gray-50'}\`}>`
);

// We need to apply `dark:` prefix to all hardcoded white/black colors and provide light equivalents.
// It's safer to just replace common color strings.
const replacements = [
  ['bg-black/80', 'bg-white/80 dark:bg-black/80'],
  ['border-white/10', 'border-gray-200 dark:border-white/10'],
  ['border-white/5', 'border-gray-100 dark:border-white/5'],
  ['text-white/40', 'text-gray-500 dark:text-white/40'],
  ['text-white/30', 'text-gray-400 dark:text-white/30'],
  ['text-white/20', 'text-gray-300 dark:text-white/20'],
  ['text-white/10', 'text-gray-200 dark:text-white/10'],
  ['bg-white/10', 'bg-gray-200 dark:bg-white/10'],
  ['bg-white/5', 'bg-white dark:bg-white/5'],
  ['bg-white/3', 'bg-gray-50 dark:bg-white/3'],
  ['text-white', 'text-gray-900 dark:text-white'],
  ['bg-black/60', 'bg-gray-100 dark:bg-black/60'],
];

for (const [oldClass, newClass] of replacements) {
  // We use regex to replace whole word boundary matches of Tailwind classes, 
  // avoiding replacing inside already replaced strings if possible.
  code = code.split(oldClass).join(newClass);
}

fs.writeFileSync('src/app/admin/page.tsx', code);
