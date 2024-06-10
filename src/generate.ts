import fs from 'fs-extra';
import path from 'path';
import { optimize } from 'svgo';
import { filterSvgFiles, toPascalCase } from './utils';
import { SvgToFontOptions } from './';

/**
 * Generate Icon SVG Path Source
 * <font-name>.json
 */
export async function generateIconsSource(options: SvgToFontOptions = {}) {
    const ICONS_PATH = filterSvgFiles(options.src)
    const data = await buildPathsObject(ICONS_PATH, options);
    const outPath = path.join(options.dist, `${options.fontName}.json`);
    await fs.outputFile(outPath, `{${data}\n}`);
    return outPath;
}

/**
 * Loads SVG file for each icon, extracts path strings `d="path-string"`,
 * and constructs map of icon name to array of path strings.
 * @param {array} files
 */
async function buildPathsObject(files: string[], options: SvgToFontOptions = {}) {
    const svgoOptions = options.svgoOptions || {};
    return Promise.all(
        files.map(async filepath => {
            const name = path.basename(filepath, '.svg');
            const svg = fs.readFileSync(filepath, 'utf-8');
            const pathStrings = optimize(svg, {
                path: filepath,
                ...options,
                plugins: [
                    'convertTransform',
                    ...(svgoOptions.plugins || [])
                    // 'convertShapeToPath'
                ],
            });
            const str: string[] = (pathStrings.data.match(/ d="[^"]+"/g) || []).map(s => s.slice(3));
            return `\n"${name}": [${str.join(',\n')}]`;
        }),
    );
}

const reactSource = (name: string, size: string, fontName: string, source: string) => `import React from 'react';
export const ${name} = props => (
  <svg viewBox="0 0 20 20" ${size ? `width="${size}" height="${size}"` : ''} {...props} className={\`${fontName} \${props.className ? props.className : ''}\`}>${source}</svg>
);
`;

const reactTypeSource = (name: string) => `import React from 'react';
export declare const ${name}: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
`;

/**
 * Generate React Icon
 * <font-name>.json
 */
export async function generateReactIcons(options: SvgToFontOptions = {}) {
    const ICONS_PATH = filterSvgFiles(options.src);
    const data = await outputReactFile(ICONS_PATH, options);
    const outPath = path.join(options.dist, 'react', 'index.js');
    fs.outputFileSync(outPath, data.join('\n'));
    fs.outputFileSync(outPath.replace(/\.js$/, '.d.ts'), data.join('\n'));
    return outPath;
}

async function outputReactFile(files: string[], options: SvgToFontOptions = {}) {
    const svgoOptions = options.svgoOptions || {};
    const fontSizeOpt = typeof options.css !== 'boolean' && options.css.fontSize
    const fontSize = typeof fontSizeOpt === 'boolean' ? (fontSizeOpt === true ? '16px' : '') : fontSizeOpt;
    const fontName = options.classNamePrefix || options.fontName
    return Promise.all(
        files.map(async filepath => {
            let name = toPascalCase(path.basename(filepath, '.svg'));
            if (/^[rR]eact$/.test(name)) {
                name = name + toPascalCase(fontName);
            }
            const svg = fs.readFileSync(filepath, 'utf-8');
            const pathData = optimize(svg, {
                path: filepath,
                ...svgoOptions,
                plugins: [
                    'removeXMLNS',
                    'removeEmptyAttrs',
                    'convertTransform',
                    // 'convertShapeToPath',
                    // 'removeViewBox'
                    ...(svgoOptions.plugins || [])
                ]
            });
            const str: string[] = (pathData.data.match(/ d="[^"]+"/g) || []).map(s => s.slice(3));
            const outDistPath = path.join(options.dist, 'react', `${name}.js`);
            const pathStrings = str.map((d, i) => `<path d=${d} fillRule="evenodd" />`);
            const comName = isNaN(Number(name.charAt(0))) ? name : toPascalCase(fontName) + name;
            fs.outputFileSync(outDistPath, reactSource(comName, fontSize, fontName, pathStrings.join(',\n')));
            fs.outputFileSync(outDistPath.replace(/\.js$/, '.d.ts'), reactTypeSource(comName));
            return `export * from './${name}';`;
        }),
    );
}

const reactNativeSource = (fontName: string, defaultSize: number, iconMap: Map<string, string>) => `import { Text } from 'react-native';

const icons = ${JSON.stringify(Object.fromEntries(iconMap))};

export const ${fontName} = ({iconName, ...rest}) => {
  return (<Text style={{fontFamily: '${fontName}', fontSize: ${defaultSize}, color: '#000000', ...rest}}>
    {icons[iconName]}
  </Text>);
};
`;

const reactNativeTypeSource = (name: string, iconMap: Map<string, string>) => `import { TextStyle } from 'react-native';

export type ${name}IconNames = ${[...iconMap.keys()].reduce((acc, key, index) => {
    if (index === 0) {
        acc = `'${key}'`
    } else {
        acc += ` | '${key}'`
    }
    return acc;
}, `${'string'}`)}

export interface ${name}Props extends Omit<TextStyle, 'fontFamily' | 'fontStyle' | 'fontWeight'> {
  iconName: ${name}IconNames
}

export declare const ${name}: (props: ${name}Props) => JSX.Element;
`;

/**
 * Generate ReactNative Icon
 * <font-name>.json
 */
export function generateReactNativeIcons(options: SvgToFontOptions = {}, unicodeObject: Record<string, string>) {
    const ICONS_PATH = filterSvgFiles(options.src);
    outputReactNativeFile(ICONS_PATH, options, unicodeObject);
}

function outputReactNativeFile(files: string[], options: SvgToFontOptions = {}, unicodeObject: Record<string, string>) {
    const fontSizeOpt = typeof options.css !== 'boolean' && options.css.fontSize;
    const fontSize = typeof fontSizeOpt === 'boolean' ? 16 : parseInt(fontSizeOpt);
    const fontName = options.classNamePrefix || options.fontName
    const iconMap = new Map<string, string>();
    files.map(filepath => {
        const baseFileName = path.basename(filepath, '.svg');
        iconMap.set(baseFileName, unicodeObject[baseFileName])
    });
    const outDistPath = path.join(options.dist, 'reactNative', `${fontName}.jsx`);
    const comName = isNaN(Number(fontName.charAt(0))) ? fontName : toPascalCase(fontName) + name;
    fs.outputFileSync(outDistPath, reactNativeSource(comName, fontSize, iconMap));
    fs.outputFileSync(outDistPath.replace(/\.jsx$/, '.d.ts'), reactNativeTypeSource(comName, iconMap));
}

/**
 * Generate Flutter Icon
 * <font-name>.json
 */
export function generateFlutterIcons(options: SvgToFontOptions = {}, unicodeObject: Record<string, string>) {
    const ICONS_PATH = filterSvgFiles(options.src);
    // Create file pubspec.yaml
    outputFlutterFilePubspec(options);

    // Create file icon_data.dart
    outputFlutterFileIconData(options);

    // Create file <font-name>.dart
    outputFlutterFile(ICONS_PATH, options, unicodeObject);

    // Copy file .ttf
    // Create folder fonts
    fs.mkdirpSync(path.join(options.dist, 'flutter', 'fonts'));
    fs.copyFileSync(path.join(options.dist, `${options.fontName}.ttf`), path.join(options.dist, 'flutter', 'fonts', `${options.fontName}.ttf`));

}

function outputFlutterFilePubspec(options: SvgToFontOptions = {}) {
    const fontName = options.classNamePrefix || options.fontName
    const outDistPath = path.join(options.dist, 'flutter', 'pubspec.yaml');
    const pubspecFile = path.join(__dirname, 'flutter_icons', 'pubspec.yaml');
    let fileContent = fs.readFileSync(pubspecFile, 'utf-8');
    // Replace {{fontName}} with fontName
    fileContent = fileContent.replace(/{{fontName}}/g, fontName);
    // Replace {{fontFamily}} with fontFamily
    fileContent = fileContent.replace(/{{fontFamily}}/g, fontName);

    // Write file
    fs.outputFileSync(outDistPath, fileContent);
}

function outputFlutterFileIconData(options: SvgToFontOptions = {}) {
    const fontName = options.classNamePrefix || options.fontName
    const fontFamily = toPascalCase(fontName);
    const className = toPascalCase(fontName) + 'IconData';
    const fontPackage = options.fontName + '_icons';

    // Read file template
    const iconDataFile = path.join(__dirname, 'flutter_icons', 'lib', 'src', 'icon_data.dart');
    let fileContent = fs.readFileSync(iconDataFile, 'utf-8');

    // Replace {{iconName}} with iconName
    fileContent = fileContent.replace(/{{fontFamily}}/g, fontFamily);
    // Replace {{unicode}} with unicode
    fileContent = fileContent.replace(/{{fontName}}/g, fontName);
    // Replace {{className}} with className
    fileContent = fileContent.replace(/{{className}}/g, className);
    // Replace {{fontPackage}} with fontPackage
    fileContent = fileContent.replace(/{{fontPackage}}/g, fontPackage);

    // Write file
    fs.outputFileSync(path.join(options.dist, 'flutter', 'lib', 'src', 'icon_data.dart'), fileContent);
}

function outputFlutterFile(files: string[], options: SvgToFontOptions = {}, unicodeObject: Record<string, string>) {
    const fontName = options.classNamePrefix || options.fontName
    const className = toPascalCase(fontName);
    const classFontData = toPascalCase(fontName) + 'IconData';

    let generatedOutput = [
        `library ${fontName}_icons;\n\n`,
        "import \"package:flutter/widgets.dart\";\n",
        "import \"src/icon_data.dart\";\n\n",
        `const Map<String, IconData> ${className}IconsMap = {\n`
    ];

    Object.keys(unicodeObject).forEach(iconName => {
        generatedOutput.push(`  '${iconName}': new ${classFontData}(0x${unicodeObject[iconName]}),\n`);
    });

    const outDistPath = path.join(options.dist, 'flutter', `${fontName}.dart`);

    generatedOutput.push('};');

    // Write file
    fs.outputFileSync(outDistPath, generatedOutput.join(''));
}
