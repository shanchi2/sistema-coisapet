import { supabase } from '../../../lib/supabase'

export async function fetchGroups() {
  const { data, error } = await supabase
    .from('chat_groups')
    .select('*, creator:system_users!created_by(name), members:chat_group_members(user_id, member:system_users!chat_group_members_user_id_fkey(id,name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createGroup(name, memberIds, createdBy) {
  const { data: group, error } = await supabase.from('chat_groups').insert({ name, created_by: createdBy }).select().single()
  if (error) throw error
  const allIds = [...new Set([...memberIds, createdBy])]
  const { error: memErr } = await supabase.from('chat_group_members').insert(
    allIds.map(uid => ({ group_id: group.id, user_id: uid, added_by: createdBy }))
  )
  if (memErr) throw memErr
  return group
}

export async function renameGroup(groupId, name) {
  const { error } = await supabase.from('chat_groups').update({ name }).eq('id', groupId)
  if (error) throw error
}

export async function addMember(groupId, userId, addedBy) {
  const { error } = await supabase.from('chat_group_members').insert({ group_id: groupId, user_id: userId, added_by: addedBy })
  if (error) throw error
}

export async function removeMember(groupId, userId) {
  const { error } = await supabase.from('chat_group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.from('chat_groups').delete().eq('id', groupId)
  if (error) throw error
}
