export const cardPriorities = ["low", "medium", "high", "urgent"] as const;
export type CardPriority = typeof cardPriorities[number];
export type Card = { id: string; title: string; details: string; priority?: CardPriority };
export type Column = { id: string; name: string; cards: Card[] };
export type Action =
  | { type: "create-list"; listId: string; name: string }
  | { type: "delete-list"; columnId: string }
  | { type: "add"; columnId: string; card: Card }
  | { type: "delete"; cardId: string }
  | { type: "edit"; cardId: string; title?: string; details?: string }
  | { type: "set-priority"; cardId: string; priority: CardPriority | null }
  | { type: "assistant"; snapshot: Column[]; actions: Action[] }
  | { type: "rename"; columnId: string; name: string }
  | { type: "move"; cardId: string; columnId: string; index?: number };

export const initialBoard: Column[] = [
  { id: "ideas", name: "Ideas", cards: [
    { id: "c1", title: "Give the homepage a fresh start", details: "Explore a quieter layout with bold typography and more room for the story." },
    { id: "c2", title: "A small moment of delight", details: "Collect a few thoughtful interactions that make everyday tasks feel better." },
    { id: "c3", title: "Rethink the welcome email", details: "Make the first hello feel personal, useful, and unmistakably us." },
  ] },
  { id: "planned", name: "Planned", cards: [
    { id: "c4", title: "Map the first-time experience", details: "Sketch the journey from landing on the site to that first little win." },
    { id: "c5", title: "Build a color story", details: "Bring together the core palette and check contrast across key surfaces." },
  ] },
  { id: "progress", name: "In progress", cards: [
    { id: "c6", title: "Design the project overview", details: "One clear place to see what matters and where the work is heading." },
    { id: "c7", title: "Find the right words", details: "Refine headings and button labels. Keep the language warm and direct." },
    { id: "c8", title: "Make it work on mobile", details: "Give the smaller screen the same care as the big one." },
  ] },
  { id: "review", name: "In review", cards: [
    { id: "c9", title: "Polish the component library", details: "Review spacing, focus states, and the details that hold everything together." },
    { id: "c10", title: "A second pair of eyes", details: "Walk through the prototype and capture anything that feels unclear." },
  ] },
  { id: "done", name: "Done", cards: [
    { id: "c11", title: "Set the creative direction", details: "Calm, considered, and a little unexpected. A foundation to build on." },
    { id: "c12", title: "Bring the team together", details: "Align on the problem, the possibilities, and what a good outcome looks like." },
  ] },
];

export function boardReducer(board: Column[], action: Action): Column[] {
  switch (action.type) {
    case "create-list":
      return action.name.trim() ? [...board, { id: action.listId, name: action.name.trim(), cards: [] }] : board;
    case "delete-list":
      return board.filter(column => column.id !== action.columnId);
    case "assistant":
      return board === action.snapshot ? action.actions.reduce(boardReducer, board) : board;
    case "add":
      if (!action.card.title.trim()) return board;
      return board.map(column => column.id === action.columnId
        ? { ...column, cards: [...column.cards, { ...action.card, title: action.card.title.trim(), details: action.card.details.trim() }] }
        : column);
    case "delete":
      return board.map(column => ({ ...column, cards: column.cards.filter(card => card.id !== action.cardId) }));
    case "edit":
      if (action.title !== undefined && !action.title.trim()) return board;
      return board.map(column => ({ ...column, cards: column.cards.map(card => card.id === action.cardId
        ? { ...card, title: action.title?.trim() ?? card.title, details: action.details?.trim() ?? card.details }
        : card) }));
    case "set-priority":
      return board.map(column => ({ ...column, cards: column.cards.map(card => card.id === action.cardId
        ? action.priority === null ? { id: card.id, title: card.title, details: card.details } : { ...card, priority: action.priority }
        : card) }));
    case "rename":
      if (!action.name.trim()) return board;
      return board.map(column => column.id === action.columnId ? { ...column, name: action.name.trim() } : column);
    case "move": {
      const source = board.find(column => column.cards.some(card => card.id === action.cardId))!;
      if (source.id === action.columnId) {
        if (action.index === undefined) return board;
        const currentIndex = source.cards.findIndex(card => card.id === action.cardId);
        if (currentIndex === action.index) return board;

        const cards = [...source.cards];
        const [card] = cards.splice(currentIndex, 1);
        cards.splice(action.index, 0, card);
        return board.map(column => column === source ? { ...column, cards } : column);
      }
      const card = source.cards.find(card => card.id === action.cardId)!;
      return board.map(column => column.id === source.id
        ? { ...column, cards: column.cards.filter(item => item.id !== card.id) }
        : column.id === action.columnId ? { ...column, cards: [...column.cards.slice(0, action.index ?? column.cards.length), card, ...column.cards.slice(action.index ?? column.cards.length)] } : column);
    }
  }
}
