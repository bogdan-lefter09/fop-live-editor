import { useRef, useEffect } from 'react';
import { Workspace } from '../types';

interface SearchPanelProps {
  workspace: Workspace | null;
  onFileClick: (filePath: string, line?: number) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (value: boolean) => void;
  useRegex: boolean;
  setUseRegex: (value: boolean) => void;
  isSearching: boolean;
  setIsSearching: (value: boolean) => void;
  results: SearchResult[];
  setResults: (results: SearchResult[]) => void;
  error: string;
  setError: (error: string) => void;
  expandedFiles: Set<string>;
  setExpandedFiles: (files: Set<string>) => void;
}

export interface SearchResult {
  file: string;
  matches: Array<{
    line: number;
    column: number;
    text: string;
    matchText: string;
  }>;
}

export const SearchPanel = ({ 
  workspace, 
  onFileClick,
  searchQuery,
  setSearchQuery,
  caseSensitive,
  setCaseSensitive,
  useRegex,
  setUseRegex,
  isSearching,
  setIsSearching,
  results,
  setResults,
  error,
  setError,
  expandedFiles,
  setExpandedFiles
}: SearchPanelProps) => {
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim() || !workspace) {
      setResults([]);
      setError('');
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch();
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, caseSensitive, useRegex, workspace]);

  const performSearch = async () => {
    if (!workspace || !searchQuery.trim()) return;

    setIsSearching(true);
    setError('');

    try {
      const response = await window.electronAPI.searchWorkspace(
        workspace.path,
        searchQuery,
        { caseSensitive, useRegex }
      );

      if (response.success) {
        setResults(response.results);
        // Auto-expand all files when results arrive
        const allFiles = new Set(response.results.map(r => r.file));
        setExpandedFiles(allFiles);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleFileExpansion = (file: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(file)) {
      newExpanded.delete(file);
    } else {
      newExpanded.add(file);
    }
    setExpandedFiles(newExpanded);
  };

  const handleResultClick = (file: string, line: number) => {
    onFileClick(file, line);
  };

  const getTotalMatches = () => {
    return results.reduce((total, result) => total + result.matches.length, 0);
  };

  const highlightMatch = (text: string, matchText: string) => {
    if (!matchText) return text;
    
    const parts = text.split(new RegExp(`(${matchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, caseSensitive ? 'g' : 'gi'));
    
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === matchText.toLowerCase() ? (
            <span key={i} className="search-highlight">{part}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div className="search-panel">
      <div className="panel-header">
        <h4>SEARCH</h4>
      </div>
      <div className="search-content">
        <div className="search-input-container">
          <input 
            type="text" 
            placeholder="Search..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!workspace}
          />
          {isSearching && <span className="search-spinner">⏳</span>}
        </div>

        <div className="search-options">
          <label className="search-option">
            <input 
              type="checkbox" 
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              disabled={!workspace}
            />
            <span>Case Sensitive (Aa)</span>
          </label>
          <label className="search-option">
            <input 
              type="checkbox" 
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              disabled={!workspace}
            />
            <span>Use Regex (.*)</span>
          </label>
        </div>

        {!workspace && (
          <p className="search-message">Open a workspace to search files.</p>
        )}

        {error && (
          <p className="search-error">{error}</p>
        )}

        {workspace && searchQuery && !isSearching && results.length === 0 && !error && (
          <p className="search-message">No results found.</p>
        )}

        {results.length > 0 && (
          <div className="search-results">
            <div className="search-summary">
              {getTotalMatches()} {getTotalMatches() === 1 ? 'result' : 'results'} in {results.length} {results.length === 1 ? 'file' : 'files'}
            </div>

            {results.map((result) => (
              <div key={result.file} className="search-file-group">
                <div 
                  className="search-file-header"
                  onClick={() => toggleFileExpansion(result.file)}
                >
                  <span className="search-file-icon">
                    {expandedFiles.has(result.file) ? '▼' : '▶'}
                  </span>
                  <span className="search-file-name">{result.file}</span>
                  <span className="search-file-count">({result.matches.length})</span>
                </div>

                {expandedFiles.has(result.file) && (
                  <div className="search-matches">
                    {result.matches.map((match, index) => (
                      <div 
                        key={`${result.file}-${match.line}-${index}`}
                        className="search-match-item"
                        onClick={() => handleResultClick(result.file, match.line)}
                      >
                        <span className="search-match-line">{match.line}:</span>
                        <span className="search-match-text">
                          {highlightMatch(match.text, match.matchText)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
