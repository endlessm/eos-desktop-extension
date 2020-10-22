project('eos-desktop-extension',
  version: '0.1',
  meson_version: '>= 0.40.0'
)

sources = [
  'extension.js',
  'settings.js',
  'utils.js',
]
extra_sources = ['COPYING']

schemas = ['com.endlessm.desktop-extension']

uuid = 'eos-desktop@endlessm.com'

ver_arr = meson.project_version().split('.')
if ver_arr[1].to_int().is_even()
  shell_version = '@0@.@1@'.format(ver_arr[0], ver_arr[1])
else
  shell_version = '.'.join(ver_arr)
endif

datadir = get_option('datadir')
extensiondir = join_paths(datadir, 'gnome-shell', 'extensions')
schemadir = join_paths(extensiondir, uuid, 'schemas')

have_schemas = schemas.length() > 0

metaconf = configuration_data()
metaconf.set('uuid', uuid)
metaconf.set('shell_version', shell_version)
if have_schemas
  metaconf.set('settings_schema', schemas[0])
endif

meta = [
  configure_file(
    input: 'metadata.json.in',
    output: 'metadata.json',
    configuration: metaconf
  )
]

# Config dirs

prefix = get_option('prefix')
localstatedir = join_paths(prefix, get_option('localstatedir'))

dirs = configuration_data()
dirs.set('datadir', join_paths(prefix, datadir))
dirs.set('localstatedir', localstatedir)

dirs_js = configure_file(
  input: 'dirs.js.in',
  output: 'dirs.js',
  configuration: dirs,
)

sources += [ dirs_js ]

install_data(sources + extra_sources + meta,
  install_dir: join_paths(extensiondir, uuid)
)

install_subdir('ui', install_dir: join_paths(extensiondir, uuid))

foreach s : schemas
  install_data('schemas/@0@.gschema.xml'.format(s),
    install_dir: schemadir
  )
endforeach

# Compile schemas manually
glib_compile = find_program('glib-compile-schemas', required: true)

run_command([glib_compile, 'schemas'])
install_data('schemas/gschemas.compiled', install_dir: schemadir)

run_command([glib_compile, 'migration'])
install_subdir('migration', install_dir: join_paths(extensiondir, uuid))

i18n = import('i18n')
subdir('po')

if have_schemas
  meson.add_install_script('meson-postinstall.sh')
endif

sassc = find_program('sassc', required: true)
sassc_opts = [ '-a', '-M', '-t', 'compact' ]
styles = custom_target(
  'styles',
  input: 'stylesheet.scss',
  output: 'stylesheet.css',
  command: [ sassc, sassc_opts, '@INPUT@', '@OUTPUT@' ],
  depend_files: 'stylesheet.scss',
  install: true,
  install_dir: join_paths(extensiondir, uuid),
  build_by_default: true)

extension_tool = find_program('gnome-extensions', required: false)
if extension_tool.found()
  builddir = meson.current_build_dir()
  srcdir = meson.current_source_dir()

  command = [
    extension_tool,
    'pack',
    '--force',
    '--out-dir=@0@'.format(builddir),
    '--extra-source=@0@/metadata.json'.format(builddir)
  ]

  foreach s : extra_sources
    command += '--extra-source=@0@'.format(s)
  endforeach

  command += srcdir

  run_target('zip-file', command: command)
endif
