import React, { useState } from 'react';
import { Search, X, Mic2, Loader2 } from 'lucide-react';

export interface KaraokeCategory {
  id: string;
  label: string;
  query: string;
}

export const KARAOKE_CATEGORIES: KaraokeCategory[] = [
  { id: 'trending', label: 'Trending Karaoke', query: 'popular karaoke songs with lyrics' },
  { id: 'pop', label: 'Pop Hits', query: 'pop hits karaoke with lyrics' },
  { id: 'rock', label: 'Classic Rock', query: 'classic rock karaoke with lyrics' },
  { id: 'acoustic', label: 'Acoustic & Piano', query: 'acoustic piano karaoke with lyrics' },
  { id: 'ballads', label: 'Power Ballads', query: 'power ballads karaoke with lyrics' },
  { id: 'throwback', label: '90s & 2000s', query: '90s 2000s karaoke songs with lyrics' },
  { id: 'sinhala', label: 'Sinhala Karaoke', query: 'sinhala karaoke songs with lyrics' },
  { id: 'hindi', label: 'Bollywood', query: 'bollywood hindi karaoke with lyrics' },
];

interface SearchHeaderProps {
  query: string;
  activeCategory: string;
  isLoading: boolean;
  onSearch: (q: string) => void;
  onSelectCategory: (cat: KaraokeCategory) => void;
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  query,
  activeCategory,
  isLoading,
  onSearch,
  onSelectCategory,
}) => {
  const [inputValue, setInputValue] = useState(query);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputValue.trim();
    if (cleaned) {
      onSearch(cleaned);
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-[#0D0E11]/95 backdrop-blur-md border-b border-white/[0.07] pt-safe">
      <div className="px-4 md:px-6 pt-3.5 pb-3 space-y-3">
        {/* Top bar: Mobile Brand + Search Form */}
        <div className="flex items-center gap-3">
          <div className="md:hidden w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Mic2 className="w-4 h-4" />
          </div>

          <form onSubmit={handleSubmit} className="relative flex-1 max-w-2xl">
            <Search className="w-4 h-4 text-[#7D8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search any song or artist (auto-filtered to YouTube Karaoke)..."
              className="w-full h-10 pl-10 pr-20 rounded-lg bg-[#161920] border border-white/[0.09] focus:border-amber-500/60 focus:outline-none text-[13.5px] text-[#F4F5F7] placeholder-[#6B7280] transition-colors"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => setInputValue('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-[#7D8594] hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0D0E11] text-[12px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Go'}
            </button>
          </form>

          <div className="hidden xl:flex items-center gap-2 text-[12px] text-[#7D8594] ml-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Karaoke Filter Active</span>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {KARAOKE_CATEGORIES.map((cat) => {
            const selected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setInputValue('');
                  onSelectCategory(cat);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors cursor-pointer border ${
                  selected
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-[#15181F] text-[#9CA3AF] border-white/[0.06] hover:text-[#F4F5F7] hover:border-white/[0.14]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
