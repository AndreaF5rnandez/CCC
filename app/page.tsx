import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data, error } = await supabase
    .from('insumos')
    .select('*')

  return (
    <div>
      <h1>Prueba Supabase</h1>

      <pre>
        {JSON.stringify(
          {
            cantidadRegistros: data?.length,
            error
          },
          null,
          2
        )}
      </pre>
    </div>
  )
}