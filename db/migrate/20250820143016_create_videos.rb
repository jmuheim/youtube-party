class CreateVideos < ActiveRecord::Migration[7.1]
  def change
    create_table :videos do |t|
      t.string :youtube_identifier
      t.string :name
      t.integer :start_playback_at
      t.integer :end_playback_at
      t.integer :transition_time

      t.timestamps
    end
  end
end
