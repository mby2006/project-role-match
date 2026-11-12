import { useEffect, useId, useRef, useState } from "react";
import { searchNotes } from "./api";

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchBox({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(query, 250);
  const listId = useId();
  const inputRef = useRef(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    searchNotes(debouncedQuery, { signal: controller.signal })
      .then((items) => {
        setResults(items);
        setStatus("ready");
        setActiveIndex(-1);
      })
      .catch((cause) => {
        if (cause.name === "AbortError") return;
        setError(cause);
        setStatus("error");
      });
    return () => controller.abort();
  }, [debouncedQuery]);

  const optionId = (index) => `${listId}-option-${index}`;

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      onSelect?.(results[activeIndex]);
    } else if (event.key === "Escape") {
      setResults([]);
      setStatus("idle");
    }
  }

  const expanded = status !== "idle" && results.length > 0;

  return (
    <div className="search-box">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label="搜索笔记"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {status === "loading" && <p role="status">搜索中…</p>}
      {status === "error" && <p role="alert">搜索失败：{error.message}</p>}
      <ul id={listId} role="listbox" hidden={!expanded}>
        {results.map((item, index) => (
          <li
            key={item.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={() => onSelect?.(item)}
          >
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
