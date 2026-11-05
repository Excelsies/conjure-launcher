# Third-party notices

Conjure Launcher is MIT-licensed (see LICENSE). It includes or is derived from:

## fzy

`lib/fzy.js` is a JavaScript port of fzy's scoring (src/match.c, src/bonus.h, config.h) from
https://github.com/jhawthorn/fzy at commit 34b8886. `tests/fzy.test.js` ports its test suite.

```
The MIT License (MIT)

Copyright (c) 2014 John Hawthorn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Noctalia

Behaviour (provider model, query routing, scoring weights, views, categories, defaults and
palette) is ported from https://github.com/noctalia-dev/noctalia at commit 60861c9.
`data/emoji.json` is Noctalia's `assets/emoji.json`, minified (same entries and fields).
The colour themes in `lib/palettes.js` are Noctalia's built-in dark palettes
(`src/theme/builtin_palettes.cpp`), reduced to the nine colours the launcher uses; one text colour is
adjusted for contrast, as noted in that file.

```
MIT License

Copyright (c) 2026 noctalia-dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Gogh

Ten of the colour themes in `lib/palettes.js` (One Half Black, Moonfly, Gotham, Jellybeans, Night
Owl, Aura, Oxocarbon, Oceanic Next, Molokai, Tomorrow Night) are mapped from terminal palettes in the
Gogh collection (https://github.com/Gogh-Co/Gogh), as bundled with Ptyxis 50.1. Gogh is dual-licensed
under the MIT License and the Apache License 2.0; these are used under the MIT License.

## Yaru (Ubuntu)

The Ubuntu Light and Ubuntu Dark colour values in `lib/theme.js` were read from the Yaru GNOME Shell
theme (`yaru-theme-gnome-shell` 26.04.5.1ubuntu, https://github.com/ubuntu/yaru, GPL-3.0+). Only
individual colour values are used; no Yaru source, stylesheet or asset is included. The accent
colours are not bundled: they are read at runtime from the running GNOME Shell.
