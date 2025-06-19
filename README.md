# Divinum Officium EPUB Generator

Generate EPUB files from [divinumofficium.com](https://divinumofficium.com) for offline reading of the traditional Divine Office (Liturgy of the Hours).

This is a Node.js port of the original [Crystal implementation](https://gitlab.com/mbab/divinumofficium.epub).

## Features

- Generate EPUB files containing the Divine Office for a date range
- Support for multiple languages (Latin, English, Polish, etc.)
- Bilingual side-by-side text display
- Multiple rubrics versions (Divino Afflatu, Reduced 1955, Rubrics 1960, etc.)
- Customizable hours selection (all hours or specific ones)
- **Smart sentence splitting** for e-reader compatibility (optional)
- Optional features like verse numbers, comments, fonts, etc.
- Votive office support (Defunctorum, Parvum B.M.V.)

## Installation

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/divinumofficium_shards.git
cd divinumofficium_shards

# Install dependencies
npm install
```

## Usage

### Basic Usage

Generate an EPUB for a single date:
```bash
npm start -- --date 2024-12-25
```

Generate for a date range:
```bash
npm start -- --datefrom 2024-12-24 --dateto 2024-12-31
```

### Advanced Options

```bash
# Bilingual Latin-English with specific hours
npm start -- --date 2024-12-25 --lang1 Latin --lang2 English --horas Laudes,Vesperae

# Polish version with 1960 rubrics
npm start -- --datefrom 2024-01-01 --dateto 2024-01-07 --lang1 Polski --rubrics 1960

# Votive Office of the Dead
npm start -- --votive Defunctorum --lang1 Latin --output defunctorum.epub
```

### Available Options

- `--date, -d` - Single date (MM-DD-YYYY format)
- `--datefrom` - Start date for range
- `--dateto` - End date for range  
- `--lang1` - Primary language (default: Latin)
- `--lang2` - Secondary language for bilingual display
- `--rubrics` - Rubrics version: DA (Divino Afflatu), R1955 (Reduced 1955), 1960 (Rubrics 1960)
- `--horas` - Hours to include (default: Omnes for all)
  - Individual hours: Matutinum, Laudes, Prima, Tertia, Sexta, Nona, Vesperae, Completorium
  - Multiple: `--horas Laudes,Vesperae`
- `--votive` - Votive office: Hodie (default), Defunctorum, Parvum
- `--output, -o` - Output filename (default: do.epub)
- `--priest` - Include priest-specific prayers
- `--nocomments` - Omit liturgical comments
- `--nonumbers` - Omit verse numbers
- `--noexpand` - Don't expand psalm intonations
- `--nosplit` - Disable sentence splitting (enabled by default for traditional behavior)
- `--ascii` - Convert accented characters (ǽ, ā, etc.) to ASCII equivalents for better compatibility
- `--title` - Custom EPUB title
- `--fontdir` - Directory with custom fonts to embed

### Languages Supported

- Latin (default)
- English
- Español
- Français  
- Italiano
- Português
- Polski / Polski-New
- Deutsch
- Magyar
- Čeština/Bohemice

## Examples

### Christmas Octave in Latin
```bash
npm start -- --datefrom 12-25-2024 --dateto 01-01-2025 --lang1 Latin --title "Octava Nativitatis"
```

### Bilingual Holy Week
```bash
npm start -- --datefrom 04-13-2025 --dateto 04-20-2025 --lang1 Latin --lang2 English --title "Hebdomada Sancta / Holy Week"
```

### Monthly Breviary
```bash
npm start -- --datefrom 01-01-2025 --dateto 01-31-2025 --lang1 English --rubrics 1960 --title "January 2025 Breviary"
```

### E-Reader Optimized EPUB
```bash
# Enable sentence splitting for better e-reader display
npm start -- --datefrom 12-25-2024 --dateto 01-01-2025 --lang1 Latin --lang2 English --nosplit=false --title "Christmas Octave"
```

### ASCII-Compatible Version (for MOBI conversion)
```bash
# Convert accented characters to ASCII for better MOBI compatibility
npm start -- --datefrom 12-25-2024 --dateto 01-01-2025 --lang1 Latin --lang2 English --ascii --title "Christmas Octave"
```

## Configuration

You can create a `config.yaml` file for frequently used settings:

```yaml
lang1: Latin
lang2: English  
rubrics: DA
horas: Omnes
priest: true
nosplit: true  # Default: no sentence splitting (traditional layout)
ascii: false   # Default: preserve accented characters
```

### Sentence Splitting Feature

By default, text is kept in single rows per line for the traditional layout. However, you can enable **sentence splitting** for better e-reader compatibility:

- **Default behavior (`nosplit: true`)**: Traditional single-row layout
- **E-reader optimized (`nosplit: false` or `--nosplit=false`)**: Splits sentences at periods into separate rows

The splitting feature includes:
- **Smart punctuation detection**: Finds optimal break points at periods, semicolons, colons, and commas
- **Psalm preservation**: Automatically detects and preserves psalm verses as single rows
- **Fuzzy alignment**: Intelligently matches Latin/English sentence breaks using semantic context
- **Prayer-aware**: Recognizes common prayer patterns for better break placement

```bash
# Traditional layout (default)
npm start -- --datefrom 01-01-2025 --dateto 01-07-2025

# E-reader optimized with sentence splitting
npm start -- --datefrom 01-01-2025 --dateto 01-07-2025 --nosplit=false
```

## Troubleshooting

### Memory Issues
For large date ranges, you may need to increase Node's memory limit:
```bash
node --max-old-space-size=8192 src/main.js --datefrom 01-01-2025 --dateto 12-31-2025
```

### Network Issues
The generator fetches content from divinumofficium.com. Ensure you have a stable internet connection. For offline use, you can use the `--source` option with a local server.

## Development

### Project Structure
```
divinumofficium_shards/
├── src/
│   ├── main.js          # Entry point
│   ├── lib/
│   │   ├── epub.js      # EPUB generation
│   │   ├── do.js        # DivinumOfficium API interface
│   │   ├── horas.js     # HTML processing for hours
│   │   ├── mylexbor.js  # DOM manipulation utilities
│   │   ├── options.js   # Command line options
│   │   └── reporter.js  # Progress reporting
│   └── ...
├── assets/              # Default cover and styles
├── package.json
└── README.md
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

- Original Crystal implementation by [Marcin Babnis](https://gitlab.com/mbab)
- Content from [Divinum Officium](https://divinumofficium.com)
- Node.js port maintained by contributors

## Links

- [Original Project Documentation](https://mbab1.gitlab.io/divinumofficium.epub/)
- [Divinum Officium Website](https://divinumofficium.com)
